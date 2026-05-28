import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import Boat from '../models/Boat.js';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';
import { calculatePrice } from '../utils/pricing.js';

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

export const cancelBooking = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Booking not found');
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) throw new ApiError(404, 'Booking not found');

    const isCustomer = booking.customer.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isCustomer && !isAdmin) {
      throw new ApiError(403, 'Not authorized to cancel this booking');
    }

    if (!['pending', 'needs_new_captain', 'confirmed'].includes(booking.status)) {
      throw new ApiError(400, `Cannot cancel a ${booking.status} booking`);
    }

    const { cancellationReason } = req.body;
    booking.status = 'cancelled';
    booking.cancellationReason = cancellationReason;
    booking.timeline.push({
      event: 'cancelled',
      actor: req.user._id,
      note: cancellationReason
    });

    await booking.save();
    res.status(200).json({ success: true, data: booking });
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

    const { cancellationReason } = req.body;
    booking.status = 'cancelled';
    booking.cancellationReason = cancellationReason || 'Declined by owner';
    booking.timeline.push({
      event: 'owner_declined',
      actor: req.user._id,
      note: booking.cancellationReason
    });

    await booking.save();
    res.status(200).json({ success: true, data: booking });
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
