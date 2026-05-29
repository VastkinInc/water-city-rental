import Booking from '../models/Booking.js';
import { stripe } from './paymentController.js';

// P3 — auto-release of held payouts.
// External pinger hits POST /api/internal/release-due-trips every few minutes.
// We find bookings whose trip ended ≥30min ago, paid + held + not cancelled,
// then transfer owner/captain shares from the platform balance to their
// Connect accounts. The 6.25% platform tax stays on the platform.
//
// Idempotency is enforced two ways:
//   (1) "Claim" lock — atomic updateOne flips payoutStatus from 'held' to
//       'releasing'. Two concurrent pings cannot both claim the same booking.
//   (2) Stripe idempotency keys per (bookingId + leg). Even if the server
//       crashes between the transfer and the DB write, Stripe will return
//       the SAME transfer on retry instead of creating a second one.

const RELEASE_BUFFER_MS  = 30 * 60 * 1000; // 30 minutes after trip end
const RELEASE_BATCH_SIZE = 50;

// Statuses we refuse to release for. The Booking schema only has
// 'cancelled' (no 'disputed'/'refunded' at the status level) — but
// paymentStatus carries 'refunded'/'failed', which we also filter.
const SKIP_STATUSES         = ['cancelled'];
const REQUIRED_PAYMENT_STATE = 'paid';

const cents = (n) => Math.round(Number(n || 0) * 100);

/**
 * POST /api/internal/release-due-trips
 * Auth: x-pinger-secret header (see requirePingerSecret middleware).
 */
export const releaseDueTrips = async (_req, res, next) => {
  try {
    const now    = new Date();
    const cutoff = new Date(now.getTime() - RELEASE_BUFFER_MS);

    const due = await Booking.find({
      payoutStatus:  'held',
      paymentStatus: REQUIRED_PAYMENT_STATE,
      status:        { $nin: SKIP_STATUSES },
      tripEndAt:     { $lte: cutoff, $ne: null }
    })
      .limit(RELEASE_BATCH_SIZE)
      .select('_id');

    const summary = {
      scanned:  due.length,
      claimed:  0,
      released: 0,
      failed:   0,
      skipped:  0,
      results:  []
    };

    for (const { _id: bookingId } of due) {
      const result = await releaseOneBooking(bookingId);
      summary.results.push({ bookingId: bookingId.toString(), ...result });
      if (result.claimed)  summary.claimed++;
      if (result.outcome === 'released')        summary.released++;
      if (result.outcome === 'release_failed')  summary.failed++;
      if (result.outcome === 'skipped')         summary.skipped++;
    }

    res.status(200).json({ success: true, ...summary });
  } catch (err) {
    console.error('[P3] releaseDueTrips fatal:', err);
    next(err);
  }
};

// Returns { claimed: bool, outcome: 'released' | 'release_failed' | 'skipped',
//           error?: string, ownerTransferId?, captainTransferId? }
async function releaseOneBooking(bookingId) {
  // (1) Atomic claim: only succeeds if still 'held'. This is the lock.
  const claim = await Booking.updateOne(
    { _id: bookingId, payoutStatus: 'held' },
    { $set: { payoutStatus: 'releasing', releaseAttemptedAt: new Date() } }
  );
  if (claim.matchedCount === 0) {
    return { claimed: false, outcome: 'skipped' };
  }

  // Re-fetch after claiming so we work on fresh state.
  const booking = await Booking.findById(bookingId);
  if (!booking) {
    return { claimed: true, outcome: 'skipped' };
  }

  const ownerAmount   = cents(booking.payoutOwnerAmount);
  const captainAmount = cents(booking.payoutCaptainAmount);
  const ownerAcct     = booking.payoutOwnerStripeAccountId;
  const captainAcct   = booking.payoutCaptainStripeAccountId;
  const transferGroup = booking._id.toString();

  let ownerTransferId   = booking.ownerTransferId   || null;
  let captainTransferId = booking.captainTransferId || null;

  try {
    // (2a) Owner leg.
    if (!ownerTransferId && ownerAmount > 0 && ownerAcct) {
      const transfer = await stripe.transfers.create(
        {
          amount: ownerAmount,
          currency: 'usd',
          destination: ownerAcct,
          transfer_group: transferGroup,
          metadata: {
            bookingId: transferGroup,
            kind: 'owner'
          }
        },
        { idempotencyKey: `release:${transferGroup}:owner` }
      );
      ownerTransferId = transfer.id;
      // Persist immediately so a crash between legs is recoverable.
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { ownerTransferId } }
      );
    }

    // (2b) Captain leg (only if booking had a captain and amount > 0).
    if (!captainTransferId && captainAmount > 0 && captainAcct) {
      const transfer = await stripe.transfers.create(
        {
          amount: captainAmount,
          currency: 'usd',
          destination: captainAcct,
          transfer_group: transferGroup,
          metadata: {
            bookingId: transferGroup,
            kind: 'captain'
          }
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
    console.error(`[P3] release failed for ${transferGroup}:`, msg);
    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          payoutStatus: 'release_failed',
          releaseError: msg,
          // Keep whatever transfer ids succeeded so the next run resumes.
          ownerTransferId,
          captainTransferId
        }
      }
    );
    return { claimed: true, outcome: 'release_failed', error: msg };
  }
}
