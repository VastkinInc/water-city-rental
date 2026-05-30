import Booking from '../models/Booking.js';
import { stripe } from './paymentController.js';

// P3 — auto-release of held payouts.
// External pinger hits POST /api/internal/release-due-trips every few minutes.
// We find bookings whose trip ended ≥30min ago, paid + held + not cancelled,
// then transfer owner/captain shares from the platform balance to their
// Connect accounts. The 6.25% platform tax stays on the platform.
//
// Hardening rule: a single bad booking MUST NOT crash the whole run. Every
// per-booking step is wrapped so the response is always a 200 JSON summary.
// A 500 is reserved for truly catastrophic errors (e.g. the initial find
// query itself blowing up).
//
// Idempotency:
//   (1) "Claim" lock — atomic updateOne flips payoutStatus from 'held' to
//       'releasing'. Two concurrent pings cannot both claim the same booking.
//   (2) Stripe idempotency keys per (bookingId + leg). Even if the server
//       crashes between the transfer and the DB write, Stripe will return
//       the SAME transfer on retry instead of creating a second one.

const RELEASE_BUFFER_MS  = 30 * 60 * 1000; // 30 minutes after trip end
const RELEASE_BATCH_SIZE = 50;

const SKIP_STATUSES          = ['cancelled'];
const REQUIRED_PAYMENT_STATE = 'paid';

const cents = (n) => Math.round(Number(n || 0) * 100);

/**
 * POST /api/internal/release-due-trips
 * Auth: x-pinger-secret header (see requirePingerSecret middleware).
 */
export const releaseDueTrips = async (_req, res) => {
  console.log('[P3] release-due-trips: starting');

  const summary = {
    scanned:  0,
    claimed:  0,
    released: 0,
    failed:   0,
    skipped:  0,
    results:  []
  };

  let due;
  try {
    const now    = new Date();
    const cutoff = new Date(now.getTime() - RELEASE_BUFFER_MS);
    due = await Booking.find({
      payoutStatus:  'held',
      paymentStatus: REQUIRED_PAYMENT_STATE,
      status:        { $nin: SKIP_STATUSES },
      tripEndAt:     { $lte: cutoff, $ne: null }
    })
      .limit(RELEASE_BATCH_SIZE)
      .select('_id');
  } catch (err) {
    // Truly catastrophic — the DB find itself failed. Return 500 so the
    // pinger surfaces it; nothing was claimed, so nothing to clean up.
    console.error('[P3] release-due-trips: initial find failed:', err && err.stack || err);
    return res.status(500).json({
      success: false,
      message: 'release-due-trips: initial find failed',
      error: (err && err.message) || String(err)
    });
  }

  summary.scanned = due.length;
  console.log(`[P3] release-due-trips: scanned ${due.length} candidate booking(s)`);

  for (const { _id: bookingId } of due) {
    const idStr = bookingId.toString();
    console.log(`[P3] processing booking ${idStr}`);
    let result;
    try {
      result = await releaseOneBooking(bookingId);
    } catch (err) {
      // Defensive catch — releaseOneBooking should already handle its own
      // errors, but if anything slips through, log + record + keep going.
      console.error(`[P3] booking ${idStr} threw unexpectedly:`, err && err.stack || err);
      const msg = (err && err.message) || 'unexpected error';
      try {
        await Booking.updateOne(
          { _id: bookingId },
          { $set: { payoutStatus: 'release_failed', releaseError: msg } }
        );
      } catch (writeErr) {
        console.error(`[P3] booking ${idStr} also failed to write release_failed:`,
          writeErr && writeErr.message);
      }
      result = { claimed: true, outcome: 'release_failed', error: msg };
    }

    summary.results.push({ bookingId: idStr, ...result });
    if (result.claimed) summary.claimed++;
    if (result.outcome === 'released')       summary.released++;
    if (result.outcome === 'release_failed') summary.failed++;
    if (result.outcome === 'skipped')        summary.skipped++;
  }

  console.log(
    `[P3] release-due-trips: done — released=${summary.released} ` +
    `failed=${summary.failed} skipped=${summary.skipped} claimed=${summary.claimed}`
  );

  return res.status(200).json({ success: true, ...summary });
};

// Returns { claimed: bool, outcome: 'released' | 'release_failed' | 'skipped',
//           error?: string, ownerTransferId?, captainTransferId? }
async function releaseOneBooking(bookingId) {
  // (1) Atomic claim: only succeeds if still 'held'. This is the lock.
  let claim;
  try {
    claim = await Booking.updateOne(
      { _id: bookingId, payoutStatus: 'held' },
      { $set: { payoutStatus: 'releasing', releaseAttemptedAt: new Date() } }
    );
  } catch (err) {
    const msg = (err && err.message) || 'claim updateOne failed';
    console.error(`[P3] claim failed for ${bookingId}:`, msg);
    return { claimed: false, outcome: 'release_failed', error: msg };
  }
  if (claim.matchedCount === 0) {
    return { claimed: false, outcome: 'skipped' };
  }

  // Re-fetch after claiming so we work on fresh state.
  let booking;
  try {
    booking = await Booking.findById(bookingId);
  } catch (err) {
    const msg = (err && err.message) || 'findById failed';
    console.error(`[P3] findById failed for ${bookingId}:`, msg);
    await safeMarkFailed(bookingId, msg);
    return { claimed: true, outcome: 'release_failed', error: msg };
  }
  if (!booking) {
    return { claimed: true, outcome: 'skipped' };
  }

  // Validate the snapshotted P2 fields. Legacy bookings (pre-P2) that
  // somehow slipped through the find filter may be missing these.
  const ownerAmount   = cents(booking.payoutOwnerAmount);
  const captainAmount = cents(booking.payoutCaptainAmount);
  const ownerAcct     = booking.payoutOwnerStripeAccountId || null;
  const captainAcct   = booking.payoutCaptainStripeAccountId || null;
  const hasOwnerLeg   = ownerAmount   > 0 && !!ownerAcct;
  const hasCaptainLeg = captainAmount > 0 && !!captainAcct;

  if (!hasOwnerLeg && !hasCaptainLeg) {
    const reason = 'no payable legs (owner/captain amounts or stripeAccountIds missing)';
    console.warn(`[P3] booking ${bookingId}: skipping — ${reason}`);
    await Booking.updateOne(
      { _id: booking._id },
      { $set: { payoutStatus: 'skipped', releaseError: reason } }
    );
    return { claimed: true, outcome: 'skipped', error: reason };
  }

  const transferGroup = booking._id.toString();
  let ownerTransferId   = booking.ownerTransferId   || null;
  let captainTransferId = booking.captainTransferId || null;

  try {
    // (2a) Owner leg.
    if (!ownerTransferId && hasOwnerLeg) {
      const transfer = await stripe.transfers.create(
        {
          amount: ownerAmount,
          currency: 'usd',
          destination: ownerAcct,
          transfer_group: transferGroup,
          metadata: { bookingId: transferGroup, kind: 'owner' }
        },
        { idempotencyKey: `release:${transferGroup}:owner` }
      );
      ownerTransferId = transfer.id;
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { ownerTransferId } }
      );
    }

    // (2b) Captain leg.
    if (!captainTransferId && hasCaptainLeg) {
      const transfer = await stripe.transfers.create(
        {
          amount: captainAmount,
          currency: 'usd',
          destination: captainAcct,
          transfer_group: transferGroup,
          metadata: { bookingId: transferGroup, kind: 'captain' }
        },
        { idempotencyKey: `release:${transferGroup}:captain` }
      );
      captainTransferId = transfer.id;
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { captainTransferId } }
      );
    }

    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          payoutStatus: 'released',
          releasedAt: new Date(),
          releaseError: null,
          ownerTransferId,
          captainTransferId
        }
      }
    );

    return {
      claimed: true,
      outcome: 'released',
      ownerTransferId,
      captainTransferId
    };
  } catch (err) {
    const msg = (err && err.message) || 'unknown error';
    console.error(`[P3] release failed for ${transferGroup}:`, msg, err && err.stack);
    await safeMarkFailed(booking._id, msg, { ownerTransferId, captainTransferId });
    return { claimed: true, outcome: 'release_failed', error: msg };
  }
}

async function safeMarkFailed(bookingId, msg, extras = {}) {
  try {
    await Booking.updateOne(
      { _id: bookingId },
      { $set: { payoutStatus: 'release_failed', releaseError: msg, ...extras } }
    );
  } catch (writeErr) {
    console.error(`[P3] safeMarkFailed write failed for ${bookingId}:`,
      writeErr && writeErr.message);
  }
}
