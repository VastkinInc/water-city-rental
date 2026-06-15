import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Boat from '../models/Boat.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { calculatePrice } from '../utils/pricing.js';
import { computeCustomerRefund, getPolicy, DEFAULT_POLICY } from '../utils/refund.js';
import { stripe } from './paymentController.js';
import { sendCancellationEmails, sendDeclineEmails } from '../utils/mailer.js';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const populateBooking = (q) =>
  q
    .populate('boat', 'name photos harbor type rateType dayRate hourlyRate')
    .populate('customer', 'name email avatar')
    .populate('captain', 'name email avatar captainProfile')
    .populate('owner', 'name email avatar');

export const createBooking = async (req, res, next) => {
  try {
    const {
      boatId, captainId,
      startDate, endDate,
      numGuests, specialRequests
    } = req.body;

    if (!isValidObjectId(boatId)) throw new ApiError(400, 'Invalid boatId');

    // Batch 4B-1: captainId is optional. Null/undefined/empty string = no captain.
    const hasCaptain = !!captainId;
    if (hasCaptain && !isValidObjectId(captainId)) {
      throw new ApiError(400, 'Invalid captainId');
    }

    const boat = await Boat.findById(boatId);
    if (!boat || boat.status !== 'active') {
      throw new ApiError(404, 'Boat not found');
    }

    let captain = null;
    if (hasCaptain) {
      captain = await User.findById(captainId);
      if (!captain || captain.role !== 'captain' || !captain.isActive) {
        throw new ApiError(400, 'Invalid captain');
      }
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    let days, hours;
    if (boat.rateType === 'daily') {
      // Calendar-day convention shared with the client: May 22 → May 25 = 3 days. Min 1 day.
      const startDay = new Date(start); startDay.setHours(0, 0, 0, 0);
      const endDay   = new Date(end);   endDay.setHours(0, 0, 0, 0);
      days = Math.max(1, Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)));
    } else {
      // Hourly: use ACTUAL elapsed hours between start and end (frontend builds
      // end = start + hours*1h, so this divides cleanly). Min 1 hour.
      hours = Math.max(1, Math.round((end - start) / (1000 * 60 * 60)));
    }

    const conflict = await Booking.findOne({
      boat: boat._id,
      status: { $in: ['pending', 'confirmed'] },
      startDate: { $lte: end },
      endDate: { $gte: start }
    });
    if (conflict) {
      throw new ApiError(409, 'Boat is already booked for these dates');
    }

    // calculatePrice is null-safe for captain (returns captainTotal=0 when null)
    const pricing = calculatePrice({ boat, captain, days, hours });

    const booking = await Booking.create({
      customer: req.user._id,
      owner: boat.owner,
      captain: hasCaptain ? captain._id : null,
      hasCaptain,
      boat: boat._id,
      startDate: start,
      endDate: end,
      numGuests,
      days,
      hours,
      pricing,
      // Snapshot the boat's cancellation policy onto the booking. Renters are
      // bound by whatever was in effect at checkout — owners can later edit
      // the listing without retroactively changing the refund terms on
      // existing bookings.
      cancellationPolicy: boat.cancellationPolicy || 'standard',
      status: 'pending',
      paymentStatus: 'unpaid',
      specialRequests,
      timeline: [
        {
          event: 'requested',
          actor: req.user._id,
          note: hasCaptain ? 'Booking created' : 'Booking created (no captain)'
        }
      ]
    });

    const populated = await populateBooking(Booking.findById(booking._id));

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const listMyBookings = async (req, res, next) => {
  try {
    const { status } = req.query;

    let filter = {};
    switch (req.user.role) {
      case 'customer':
        filter.customer = req.user._id;
        break;
      case 'owner':
        filter.owner = req.user._id;
        break;
      case 'captain':
        filter.captain = req.user._id;
        break;
      case 'admin':
        filter = {};
        break;
      default:
        filter.customer = req.user._id;
    }

    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .sort({ startDate: -1 })
      .populate('boat', 'name photos harbor')
      .populate('customer', 'name')
      .populate('captain', 'name avatar')
      .populate('owner', 'name');

    res.status(200).json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
};

export const getBookingById = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await populateBooking(Booking.findById(req.params.id));
    if (!booking) throw new ApiError(404, 'Booking not found');

    const userId = req.user._id.toString();
    const isParticipant =
      booking.customer?._id?.toString() === userId ||
      booking.owner?._id?.toString() === userId ||
      (booking.captain && booking.captain._id?.toString() === userId);

    if (!isParticipant && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to view this booking');
    }

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

// Returns the canceller role + the refund decision for a booking + caller.
// Pure derivation — no DB writes. Used by both cancelBooking and getCancelPreview.
function deriveCancellation(booking, user, now = new Date()) {
  const uid = user._id.toString();
  const role = user.role;
  const isCustomer = booking.customer.toString() === uid;
  const isOwner    = booking.owner.toString() === uid;
  const isCaptain  = booking.captain && booking.captain.toString() === uid;
  const isAdmin    = role === 'admin';

  let cancellerRole = null;
  if (isCustomer) cancellerRole = 'customer';
  else if (isOwner) cancellerRole = 'owner';
  else if (isCaptain) cancellerRole = 'captain';
  else if (isAdmin) cancellerRole = 'admin';

  const grandTotal = (booking.pricing && booking.pricing.grandTotal) || 0;
  const tripStarted =
    booking.startDate &&
    new Date(booking.startDate).getTime() <= new Date(now).getTime();
  const statusActive = ['pending', 'needs_new_captain', 'confirmed'].includes(booking.status);
  const isPaid = booking.paymentStatus === 'paid';
  const fundsMoved = isPaid && booking.payoutStatus !== 'held';

  let blockReason = null;
  if (!cancellerRole) blockReason = 'Not authorized to cancel this booking';
  else if (booking.status === 'cancelled') blockReason = 'Booking is already cancelled';
  else if (!statusActive) blockReason = `Cannot cancel a ${booking.status} booking`;
  else if (tripStarted) blockReason = 'Cancellation not available after trip starts. Contact support.';
  else if (fundsMoved) blockReason = 'Funds already released or in process. Contact support.';

  // Refund per role:
  //   customer → use the booking's snapshotted cancellation policy
  //   owner / captain / admin → 100% regardless of policy
  const policyKey = booking.cancellationPolicy || DEFAULT_POLICY;
  const policyLabel = getPolicy(policyKey).label;

  let refundPct, refundAmount, refundReason;
  if (cancellerRole === 'customer') {
    const t = computeCustomerRefund(grandTotal, booking.startDate, now, policyKey);
    refundPct = t.pct;
    refundAmount = t.amount;
    refundReason = t.reason;
  } else {
    refundPct = 100;
    refundAmount = Math.round(grandTotal * 100) / 100;
    refundReason = `Full refund (${cancellerRole || 'owner'} cancellation)`;
  }

  return {
    cancellerRole,
    canCancel: !blockReason,
    blockReason,
    grandTotal,
    refundPct,
    refundAmount,
    refundReason,
    policyKey,
    policyLabel,
    willCallStripe: isPaid && refundAmount > 0
  };
}

export const getCancelPreview = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) throw new ApiError(404, 'Booking not found');
    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const d = deriveCancellation(booking, req.user);
    if (!d.cancellerRole) throw new ApiError(403, 'Not authorized');

    res.status(200).json({ success: true, data: d });
  } catch (err) {
    next(err);
  }
};

export const cancelBooking = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const now = new Date();
    const d = deriveCancellation(booking, req.user, now);
    if (!d.cancellerRole) throw new ApiError(403, 'Not authorized to cancel this booking');
    if (!d.canCancel) throw new ApiError(400, d.blockReason);

    const { cancellationReason } = req.body || {};
    const reasonText = cancellationReason || `Cancelled by ${d.cancellerRole}`;

    // ── UNPAID path: nothing to refund, just cancel.
    if (booking.paymentStatus !== 'paid') {
      booking.status = 'cancelled';
      booking.cancelledBy = req.user._id;
      booking.cancelledAt = now;
      booking.cancellationReason = reasonText;
      booking.refundAmount = 0;
      booking.timeline.push({
        event: 'cancelled',
        actor: req.user._id,
        timestamp: now,
        note: `Cancelled by ${d.cancellerRole} (unpaid — no refund needed)`
      });
      await booking.save();
      res.status(200).json({ success: true, data: booking });

      // Fire-and-forget notifications — AFTER the response is sent. `booking`
      // here is not populated, so re-fetch with relations off the request path.
      // Never awaited; a slow/failing mail send cannot affect the cancel.
      populateBooking(Booking.findById(booking._id))
        .then((p) => sendCancellationEmails(p, { cancellerRole: d.cancellerRole, refundAmount: 0 }))
        .catch((err) => console.error('[Cancel] notify failed:', err && err.message));
      return;
    }

    // ── PAID path: atomically claim the payout lock so the auto-release cron
    // can't race us. Cron's query is { payoutStatus: 'held' }, so flipping to
    // 'cancelling' permanently locks the cron out for this booking.
    const claim = await Booking.updateOne(
      { _id: booking._id, payoutStatus: 'held' },
      { $set: { payoutStatus: 'cancelling' } }
    );
    if (claim.matchedCount === 0) {
      throw new ApiError(400, 'Funds already released or in process. Contact support.');
    }

    // ── Stripe refund (if any amount). For 0% tier we just lock + finalize.
    let stripeRefundId = null;
    if (d.refundAmount > 0) {
      if (!booking.paymentIntentId) {
        // Revert the lock so admin can intervene.
        await Booking.updateOne(
          { _id: booking._id, payoutStatus: 'cancelling' },
          { $set: { payoutStatus: 'held' } }
        );
        throw new ApiError(500, 'Booking is paid but has no Stripe payment intent on record — cannot refund automatically');
      }
      const refundCents = Math.round(d.refundAmount * 100);
      try {
        const refund = await stripe.refunds.create(
          {
            payment_intent: booking.paymentIntentId,
            amount: refundCents,
            metadata: {
              bookingId: booking._id.toString(),
              cancelledBy: d.cancellerRole,
              cancellerId: req.user._id.toString(),
              refundPct: String(d.refundPct)
            }
          },
          { idempotencyKey: `cancel:${booking._id.toString()}` }
        );
        stripeRefundId = refund.id;
      } catch (stripeErr) {
        // Revert the claim so the booking can be retried (or auto-released
        // if the user actually doesn't want to cancel after all).
        await Booking.updateOne(
          { _id: booking._id, payoutStatus: 'cancelling' },
          { $set: { payoutStatus: 'held' } }
        );
        const msg = (stripeErr && stripeErr.message) || 'Stripe error';
        console.error(`[Cancel] Stripe refund failed for booking ${booking._id}: ${msg}`);
        throw new ApiError(502, `Refund failed: ${msg}`);
      }
    }

    // ── Finalize. Use $set for atomic state flip; the booking is now terminal.
    const newPaymentStatus =
      d.refundAmount >= d.grandTotal ? 'refunded' :
      d.refundAmount > 0 ? 'partially_refunded' : 'paid';

    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          status: 'cancelled',
          payoutStatus: 'cancelled',
          paymentStatus: newPaymentStatus,
          cancelledBy: req.user._id,
          cancelledAt: now,
          cancellationReason: reasonText,
          refundAmount: d.refundAmount,
          refundedAt: stripeRefundId ? now : null,
          stripeRefundId
        },
        $push: {
          timeline: {
            event: 'cancelled',
            actor: req.user._id,
            timestamp: now,
            note:
              `Cancelled by ${d.cancellerRole}. ` +
              `Refund: $${d.refundAmount.toFixed(2)} (${d.refundPct}%) — ${d.refundReason}` +
              (stripeRefundId ? ` [stripe ${stripeRefundId}]` : '')
          }
        }
      }
    );

    const populated = await populateBooking(Booking.findById(booking._id));
    res.status(200).json({ success: true, data: populated });

    // Fire-and-forget notifications — AFTER the refund is settled and the
    // response is sent. Never awaited; a slow/failing mail send cannot delay
    // or break the refund/cancel. `populated` is already loaded above.
    sendCancellationEmails(populated, { cancellerRole: d.cancellerRole, refundAmount: d.refundAmount })
      .catch((err) => console.error('[Cancel] notify failed:', err && err.message));
    return;
  } catch (err) {
    next(err);
  }
};

export const approveBooking = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const isOwner = booking.owner.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new ApiError(403, 'Not authorized to approve this booking');
    }

    if (booking.status === 'cancelled' || booking.status === 'completed') {
      throw new ApiError(400, `Cannot approve a ${booking.status} booking`);
    }

    if (booking.ownerApproved) {
      throw new ApiError(400, 'You have already approved this booking');
    }

    booking.ownerApproved = true;
    booking.timeline.push({
      event: 'owner_approved',
      actor: req.user._id
    });

    if (booking.checkAndConfirm()) {
      booking.timeline.push({
        event: 'auto_confirmed',
        actor: req.user._id,
        note: 'Both parties approved'
      });
    }

    await booking.save();
    const populated = await populateBooking(Booking.findById(booking._id));
    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const declineBooking = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const isOwner = booking.owner.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new ApiError(403, 'Not authorized to decline this booking');
    }

    if (!['pending', 'needs_new_captain'].includes(booking.status)) {
      throw new ApiError(400, `Cannot decline a ${booking.status} booking`);
    }

    const now = new Date();
    const { cancellationReason } = req.body;
    const reasonText = cancellationReason || 'Declined by owner';

    // ── UNPAID path: nothing to refund, just decline.
    if (booking.paymentStatus !== 'paid') {
      booking.status = 'cancelled';
      booking.cancelledBy = req.user._id;
      booking.cancelledAt = now;
      booking.cancellationReason = reasonText;
      booking.refundAmount = 0;
      booking.timeline.push({
        event: 'owner_declined',
        actor: req.user._id,
        timestamp: now,
        note: `${reasonText} (unpaid — no refund needed)`
      });
      await booking.save();
      res.status(200).json({ success: true, data: booking });

      // Fire-and-forget notifications — AFTER the response is sent. `booking`
      // here is not populated, so re-fetch with relations off the request path.
      populateBooking(Booking.findById(booking._id))
        .then((p) => sendDeclineEmails(p, { refundAmount: 0 }))
        .catch((err) => console.error('[Decline] notify failed:', err && err.message));
      return;
    }

    // ── PAID path: owner decline ⇒ 100% refund. This REUSES the exact verified
    // refund mechanism from cancelBooking (atomic held→cancelling claim, Stripe
    // refund with a distinct idempotency key, rollback-on-failure, Phase-C $set
    // finalize). Only the decline-specific constants differ.
    const grandTotal = (booking.pricing && booking.pricing.grandTotal) || 0;
    const refundAmount = Math.round(grandTotal * 100) / 100;

    // Atomically claim the payout lock so the auto-release cron can't race us.
    const claim = await Booking.updateOne(
      { _id: booking._id, payoutStatus: 'held' },
      { $set: { payoutStatus: 'cancelling' } }
    );
    if (claim.matchedCount === 0) {
      throw new ApiError(400, 'Funds already released or in process. Contact support.');
    }

    let stripeRefundId = null;
    if (refundAmount > 0) {
      if (!booking.paymentIntentId) {
        // Revert the lock so admin can intervene.
        await Booking.updateOne(
          { _id: booking._id, payoutStatus: 'cancelling' },
          { $set: { payoutStatus: 'held' } }
        );
        throw new ApiError(500, 'Booking is paid but has no Stripe payment intent on record — cannot refund automatically');
      }
      const refundCents = Math.round(refundAmount * 100);
      try {
        const refund = await stripe.refunds.create(
          {
            payment_intent: booking.paymentIntentId,
            amount: refundCents,
            metadata: {
              bookingId: booking._id.toString(),
              cancelledBy: 'owner',
              cancellerId: req.user._id.toString(),
              refundPct: '100',
              reason: 'owner_declined'
            }
          },
          { idempotencyKey: `decline:${booking._id.toString()}` }
        );
        stripeRefundId = refund.id;
      } catch (stripeErr) {
        // Revert the claim so the booking can be retried.
        await Booking.updateOne(
          { _id: booking._id, payoutStatus: 'cancelling' },
          { $set: { payoutStatus: 'held' } }
        );
        const msg = (stripeErr && stripeErr.message) || 'Stripe error';
        console.error(`[Decline] Stripe refund failed for booking ${booking._id}: ${msg}`);
        throw new ApiError(502, `Refund failed: ${msg}`);
      }
    }

    // ── Finalize. Atomic $set; booking is now terminal.
    const newPaymentStatus =
      refundAmount >= grandTotal ? 'refunded' :
      refundAmount > 0 ? 'partially_refunded' : 'paid';

    await Booking.updateOne(
      { _id: booking._id },
      {
        $set: {
          status: 'cancelled',
          payoutStatus: 'cancelled',
          paymentStatus: newPaymentStatus,
          cancelledBy: req.user._id,
          cancelledAt: now,
          cancellationReason: reasonText,
          refundAmount,
          refundedAt: stripeRefundId ? now : null,
          stripeRefundId
        },
        $push: {
          timeline: {
            event: 'owner_declined',
            actor: req.user._id,
            timestamp: now,
            note:
              `Declined by owner. ` +
              `Refund: $${refundAmount.toFixed(2)} (100%)` +
              (stripeRefundId ? ` [stripe ${stripeRefundId}]` : '')
          }
        }
      }
    );

    const populated = await populateBooking(Booking.findById(booking._id));
    res.status(200).json({ success: true, data: populated });

    // Fire-and-forget notifications — AFTER the refund is settled and the
    // response is sent. Never awaited; a slow/down Resend cannot block the decline.
    sendDeclineEmails(populated, { refundAmount })
      .catch((err) => console.error('[Decline] notify failed:', err && err.message));
    return;
  } catch (err) {
    next(err);
  }
};

export const completeBooking = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    // Batch 4B-1: For no-captain bookings, the OWNER marks the trip complete
    // (since there's no captain). With-captain bookings stay captain-only.
    const isCaptain = booking.captain && booking.captain.equals(req.user._id);
    const isOwnerOfNoCaptainBooking =
      booking.hasCaptain === false && booking.owner.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isCaptain && !isOwnerOfNoCaptainBooking && !isAdmin) {
      throw new ApiError(403, 'Not authorized to complete this booking');
    }

    if (booking.status !== 'confirmed') {
      throw new ApiError(400, 'Only confirmed bookings can be completed');
    }

    booking.status = 'completed';
    booking.timeline.push({
      event: 'completed',
      actor: req.user._id
    });

    await booking.save();

    await Boat.findByIdAndUpdate(booking.boat, { $inc: { totalBookings: 1 } });
    // Only increment captain trip count when there IS a captain.
    if (booking.captain) {
      await User.findByIdAndUpdate(booking.captain, {
        $inc: { 'captainProfile.totalTrips': 1 }
      });
    }

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

export const captainAccept = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const isCaptain = booking.captain.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isCaptain && !isAdmin) {
      throw new ApiError(403, 'Not authorized to accept this booking');
    }

    if (booking.status !== 'pending') {
      throw new ApiError(400, 'Cannot accept this booking now');
    }

    if (booking.captainApproved) {
      throw new ApiError(400, 'You have already accepted');
    }

    booking.captainApproved = true;
    booking.timeline.push({
      event: 'captain_accepted',
      actor: req.user._id
    });

    if (booking.checkAndConfirm()) {
      booking.timeline.push({
        event: 'auto_confirmed',
        actor: req.user._id,
        note: 'Both parties approved'
      });
    }

    await booking.save();

    const populated = await populateBooking(Booking.findById(booking._id));
    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const captainDecline = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const isCaptain = booking.captain.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isCaptain && !isAdmin) {
      throw new ApiError(403, 'Not authorized to decline this booking');
    }

    if (booking.status !== 'pending') {
      throw new ApiError(400, `Cannot decline a ${booking.status} booking`);
    }

    const { declineReason } = req.body;
    booking.status = 'needs_new_captain';
    booking.captainApproved = false; // safety reset
    // ownerApproved kept as-is intentionally
    booking.timeline.push({
      event: 'captain_declined',
      actor: req.user._id,
      note: declineReason || 'Captain unavailable'
    });

    await booking.save();
    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};

export const reassignCaptain = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const { captainId } = req.body;
    if (!isValidObjectId(captainId)) {
      throw new ApiError(400, 'Invalid captainId');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const isOwner = booking.owner.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) {
      throw new ApiError(403, 'Not authorized to reassign this booking');
    }

    if (booking.status !== 'needs_new_captain') {
      throw new ApiError(400, 'Booking is not awaiting reassignment');
    }

    if (booking.captain.toString() === String(captainId)) {
      throw new ApiError(400, 'New captain must be different');
    }

    const newCaptain = await User.findById(captainId);
    if (!newCaptain || newCaptain.role !== 'captain' || !newCaptain.isActive) {
      throw new ApiError(400, 'Invalid captain');
    }

    const boat = await Boat.findById(booking.boat);
    if (!boat) throw new ApiError(404, 'Boat not found');

    const pricing = calculatePrice({
      boat,
      captain: newCaptain,
      days:  booking.days,
      hours: booking.hours
    });

    booking.captain = newCaptain._id;
    booking.pricing = pricing;
    booking.captainApproved = false;
    // ownerApproved kept as-is intentionally
    booking.status = 'pending';
    booking.timeline.push({
      event: 'captain_reassigned',
      actor: req.user._id,
      note: 'Reassigned to ' + newCaptain.name
    });

    await booking.save();

    const populated = await populateBooking(Booking.findById(booking._id));
    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};
