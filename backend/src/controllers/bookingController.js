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
    if (!isValidObjectId(captainId)) throw new ApiError(400, 'Invalid captainId');

    const boat = await Boat.findById(boatId);
    if (!boat || boat.status !== 'active') {
      throw new ApiError(404, 'Boat not found');
    }

    const captain = await User.findById(captainId);
    if (!captain || captain.role !== 'captain' || !captain.isActive) {
      throw new ApiError(400, 'Invalid captain');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    let days, hours;
    if (boat.rateType === 'daily') {
      const ms = end - start;
      days = Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
    } else {
      const ms = end - start;
      hours = Math.max(1, Math.ceil(ms / (1000 * 60 * 60)));
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

    const pricing = calculatePrice({ boat, captain, days, hours });

    const booking = await Booking.create({
      customer: req.user._id,
      owner: boat.owner,
      captain: captain._id,
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
          note: 'Booking created'
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
      booking.captain?._id?.toString() === userId;

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

    if (!['pending', 'confirmed'].includes(booking.status)) {
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

    if (booking.status !== 'pending') {
      throw new ApiError(400, 'Only pending bookings can be approved');
    }

    booking.status = 'confirmed';
    booking.timeline.push({
      event: 'owner_approved',
      actor: req.user._id
    });

    await booking.save();
    res.status(200).json({ success: true, data: booking });
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

    if (booking.status !== 'pending') {
      throw new ApiError(400, 'Only pending bookings can be declined');
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

    const isCaptain = booking.captain.equals(req.user._id);
    const isAdmin = req.user.role === 'admin';
    if (!isCaptain && !isAdmin) {
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
    await User.findByIdAndUpdate(booking.captain, {
      $inc: { 'captainProfile.totalTrips': 1 }
    });

    res.status(200).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
};
