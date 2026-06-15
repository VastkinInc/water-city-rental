// Email sending via Resend.
//
// MONEY-SAFETY CONTRACT: nothing in this file may ever throw into a caller.
// Cancellation emails fire AFTER the refund is settled and the HTTP response
// has already been sent (fire-and-forget). A slow or failing Resend must never
// delay or break the refund/cancel flow, so every send is wrapped in try/catch
// that ONLY logs. sendMail() and sendCancellationEmails() never reject.

import { Resend } from 'resend';

// Lazy singleton — built on first send so a missing key doesn't crash boot.
let _resend = null;
let _warned = false;

function getClient() {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (!_warned) {
      console.warn('[mailer] RESEND_API_KEY not set — email sends are disabled (no-op).');
      _warned = true;
    }
    return null;
  }
  _resend = new Resend(key);
  return _resend;
}

/**
 * Send one email. Never throws, never rejects — returns true on success,
 * false on any failure (logged). Safe to call un-awaited.
 */
export async function sendMail({ to, subject, html }) {
  try {
    const client = getClient();
    if (!client) return false; // disabled (no key) — silent no-op after first warn
    const from = process.env.MAIL_FROM;
    if (!from) {
      console.warn('[mailer] MAIL_FROM not set — skipping send to', to);
      return false;
    }
    if (!to) return false;

    const { error } = await client.emails.send({ from, to, subject, html });
    if (error) {
      console.error(`[mailer] Resend rejected email to ${to}: ${error.message || error}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[mailer] send failed to ${to}: ${(err && err.message) || err}`);
    return false;
  }
}

// ── Cancellation templates ──────────────────────────────────────────────────

const ROLE_LABEL = {
  customer: 'the customer',
  owner: 'the boat owner',
  captain: 'the captain',
  admin: 'an administrator'
};

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });
  } catch {
    return String(d);
  }
}

function fmtMoney(n) {
  const v = Number(n) || 0;
  return '$' + v.toFixed(2);
}

// Shared plain wrapper — light, readable, no heavy design.
function wrap(title, bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#faf7f2;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <h1 style="font-size:20px;margin:0 0 16px;color:#1a1a2e;">Water City Rental</h1>
      <h2 style="font-size:17px;margin:0 0 16px;color:#c4623a;">${title}</h2>
      ${bodyHtml}
      <p style="font-size:12px;color:#6b6560;margin-top:28px;border-top:1px solid #e6ddd2;padding-top:14px;">
        This is an automated message from Water City Rental. Please do not reply to this email.
      </p>
    </div>
  </body>
</html>`;
}

// Booking facts table reused by every template.
function detailsTable(b) {
  const boatName = (b.boat && b.boat.name) || 'your boat';
  const ref = b.bookingNumber || (b._id ? String(b._id) : '—');
  const row = (label, val) =>
    `<tr>
       <td style="padding:6px 12px 6px 0;color:#6b6560;font-size:14px;">${label}</td>
       <td style="padding:6px 0;font-size:14px;color:#1a1a2e;"><strong>${val}</strong></td>
     </tr>`;
  return `<table style="border-collapse:collapse;margin:8px 0 4px;">
    ${row('Booking', '#' + ref)}
    ${row('Boat', boatName)}
    ${row('Dates', fmtDate(b.startDate) + ' → ' + fmtDate(b.endDate))}
  </table>`;
}

/**
 * Send cancellation notifications to all parties for a single booking.
 *
 * @param {object} booking  POPULATED booking (boat.name, customer{name,email},
 *                          owner{name,email}, captain{name,email}, bookingNumber,
 *                          startDate, endDate).
 * @param {object} meta     { cancellerRole: 'customer'|'owner'|'captain'|'admin',
 *                            refundAmount: number }
 *
 * Never throws. Each recipient is sent independently; one failure does not stop
 * the others. Safe to call un-awaited.
 */
export async function sendCancellationEmails(booking, { cancellerRole, refundAmount } = {}) {
  try {
    if (!booking) return;

    const by = ROLE_LABEL[cancellerRole] || 'one of the parties';
    const details = detailsTable(booking);
    const boatName = (booking.boat && booking.boat.name) || 'the boat';
    const refund = Number(refundAmount) || 0;

    const customer = booking.customer || {};
    const owner = booking.owner || {};
    const captain = booking.captain || {};

    // 1) Customer — confirmation, includes refund amount.
    if (customer.email) {
      const refundLine = refund > 0
        ? `<p style="font-size:14px;line-height:1.6;">A refund of <strong>${fmtMoney(refund)}</strong> has been issued to your original payment method. It may take a few business days to appear.</p>`
        : `<p style="font-size:14px;line-height:1.6;">No refund was due for this cancellation under the booking's cancellation policy.</p>`;
      await sendMail({
        to: customer.email,
        subject: `Your booking for ${boatName} has been cancelled`,
        html: wrap('Booking cancelled', `
          <p style="font-size:14px;line-height:1.6;">Hi ${customer.name || 'there'},</p>
          <p style="font-size:14px;line-height:1.6;">Your booking has been cancelled by ${by}.</p>
          ${details}
          ${refundLine}
        `)
      });
    }

    // 2) Owner — alert.
    if (owner.email) {
      await sendMail({
        to: owner.email,
        subject: `Booking cancelled — ${boatName}`,
        html: wrap('A booking was cancelled', `
          <p style="font-size:14px;line-height:1.6;">Hi ${owner.name || 'there'},</p>
          <p style="font-size:14px;line-height:1.6;">The following booking was cancelled by ${by}.</p>
          ${details}
        `)
      });
    }

    // 3) Captain — alert, ONLY if a captain with an email is on the booking.
    if (captain.email) {
      await sendMail({
        to: captain.email,
        subject: `Booking cancelled — ${boatName}`,
        html: wrap('A booking was cancelled', `
          <p style="font-size:14px;line-height:1.6;">Hi ${captain.name || 'there'},</p>
          <p style="font-size:14px;line-height:1.6;">A trip you were assigned to was cancelled by ${by}.</p>
          ${details}
        `)
      });
    }
  } catch (err) {
    // Absolute backstop — must never reject into a caller.
    console.error(`[mailer] sendCancellationEmails failed: ${(err && err.message) || err}`);
  }
}

/**
 * Send decline notifications for an owner-declined (previously pending) booking.
 *
 * Worded as a DECLINED REQUEST, not a cancellation — the booking never reached
 * confirmed. If the booking had been paid, declineBooking issues a 100% refund;
 * pass that amount here so the customer sees it.
 *
 * @param {object} booking  POPULATED booking (boat.name, customer{name,email},
 *                          owner{name,email}, captain{name,email}, bookingNumber,
 *                          startDate, endDate).
 * @param {object} meta     { refundAmount: number }  // 0 if the request was unpaid
 *
 * Never throws. Each recipient is sent independently. Safe to call un-awaited.
 */
export async function sendDeclineEmails(booking, { refundAmount } = {}) {
  try {
    if (!booking) return;

    const details = detailsTable(booking);
    const boatName = (booking.boat && booking.boat.name) || 'the boat';
    const refund = Number(refundAmount) || 0;

    const customer = booking.customer || {};
    const owner = booking.owner || {};
    const captain = booking.captain || {};

    // 1) Customer — request declined. Refund line only if money was refunded.
    if (customer.email) {
      const refundLine = refund > 0
        ? `<p style="font-size:14px;line-height:1.6;">A full refund of <strong>${fmtMoney(refund)}</strong> has been issued to your original payment method. It may take a few business days to appear.</p>`
        : '';
      await sendMail({
        to: customer.email,
        subject: `Your booking request for ${boatName} was declined`,
        html: wrap('Booking request declined', `
          <p style="font-size:14px;line-height:1.6;">Hi ${customer.name || 'there'},</p>
          <p style="font-size:14px;line-height:1.6;">Unfortunately, the owner was unable to accept your booking request.</p>
          ${details}
          ${refundLine}
          <p style="font-size:14px;line-height:1.6;">You're welcome to browse other boats and book again anytime.</p>
        `)
      });
    }

    // 2) Owner — confirmation they declined.
    if (owner.email) {
      await sendMail({
        to: owner.email,
        subject: `You declined a booking request — ${boatName}`,
        html: wrap('Booking request declined', `
          <p style="font-size:14px;line-height:1.6;">Hi ${owner.name || 'there'},</p>
          <p style="font-size:14px;line-height:1.6;">You declined the following booking request.</p>
          ${details}
        `)
      });
    }

    // 3) Captain — ONLY if one was assigned with an email (pending usually none).
    if (captain.email) {
      await sendMail({
        to: captain.email,
        subject: `Booking request declined — ${boatName}`,
        html: wrap('Booking request declined', `
          <p style="font-size:14px;line-height:1.6;">Hi ${captain.name || 'there'},</p>
          <p style="font-size:14px;line-height:1.6;">A booking you were assigned to was declined by the owner.</p>
          ${details}
        `)
      });
    }
  } catch (err) {
    // Absolute backstop — must never reject into a caller.
    console.error(`[mailer] sendDeclineEmails failed: ${(err && err.message) || err}`);
  }
}
