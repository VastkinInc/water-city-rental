import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Booking from '../models/Booking.js';
import { ApiError } from '../utils/ApiError.js';
import { updateBoatRating, updateCaptainRating } from '../utils/ratingUpdater.js';

function formatReviewerName(fullName) {
  const name = (fullName || 'Customer').trim();
  const parts = name.split(/\s+/);
  if (parts.length === 1) return parts[0];
  return parts[0] + ' ' + parts[parts.length - 1].charAt(0).toUpperCase() + '.';
}

export const createReview = async (req, res, next) => {
  try {
    const { bookingId, boatRating, boatComment, captainRating, captainComment } = req.body;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(bookingId)) {
      throw new ApiError(400, 'Invalid booking ID');
    }
    if (!boatRating || boatRating < 1 || boatRating > 5) {
      throw new ApiError(400, 'Boat rating must be 1-5');
    }
    if (!captainRating || captainRating < 1 || captainRating > 5) {
      throw new ApiError(400, 'Captain rating must be 1-5');
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.customer.toString() !== userId.toString()) {
      throw new ApiError(403, 'Only the customer can review this booking');
    }

    if (booking.status !== 'completed') {
      throw new ApiError(400, 'Only completed trips can be reviewed');
    }

    const existing = await Review.findOne({ booking: bookingId });
    if (existing) {
      throw new ApiError(409, 'Review already submitted for this booking');
    }

    const review = await Review.create({
      booking: bookingId,
      customer: userId,
      boat: booking.boat,
      captain: booking.captain,
      boatRating,
      boatComment: boatComment || '',
      captainRating,
      captainComment: captainComment || ''
    });

    await updateBoatRating(booking.boat);
    await updateCaptainRating(booking.captain);

    const populated = await Review.findById(review._id)
      .populate('customer', 'name avatar')
      .populate('boat', 'name')
      .populate('captain', 'name');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const listBoatReviews = async (req, res, next) => {
  try {
    const { boatId } = req.params;
    if (!mongoose.isValidObjectId(boatId)) {
      throw new ApiError(400, 'Invalid boat ID');
    }

    const reviews = await Review.find({ boat: boatId })
      .populate('customer', 'name avatar')
      .sort('-createdAt')
      .lean();

    const formatted = reviews.map((r) => ({
      _id: r._id,
      rating: r.boatRating,
      comment: r.boatComment,
      createdAt: r.createdAt,
      reviewer: {
        displayName: formatReviewerName(r.customer && r.customer.name),
        avatar: r.customer ? r.customer.avatar : null
      }
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

export const listCaptainReviews = async (req, res, next) => {
  try {
    const { captainId } = req.params;
    if (!mongoose.isValidObjectId(captainId)) {
      throw new ApiError(400, 'Invalid captain ID');
    }

    const reviews = await Review.find({ captain: captainId })
      .populate('customer', 'name avatar')
      .populate('boat', 'name')
      .sort('-createdAt')
      .lean();

    const formatted = reviews.map((r) => ({
      _id: r._id,
      rating: r.captainRating,
      comment: r.captainComment,
      createdAt: r.createdAt,
      boatName: r.boat ? r.boat.name : '',
      reviewer: {
        displayName: formatReviewerName(r.customer && r.customer.name),
        avatar: r.customer ? r.customer.avatar : null
      }
    }));

    res.status(200).json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
};

export const getBookingReview = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    if (!mongoose.isValidObjectId(bookingId)) {
      throw new ApiError(400, 'Invalid booking ID');
    }

    const review = await Review.findOne({ booking: bookingId })
      .populate('customer', 'name avatar')
      .lean();

    if (!review) {
      return res.status(200).json({ success: true, data: null });
    }

    res.status(200).json({ success: true, data: review });
  } catch (err) {
    next(err);
  }
};

export const getMyPendingReviews = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(200).json({ success: true, data: [], count: 0 });
    }

    const completedBookings = await Booking.find({
      customer: req.user._id,
      status: 'completed'
    }).select('_id').lean();

    const completedIds = completedBookings.map((b) => b._id);

    const reviewedIds = new Set(
      (await Review.find({ booking: { $in: completedIds } })
        .select('booking')
        .lean()).map((r) => r.booking.toString())
    );

    const pendingIds = completedIds.filter((id) => !reviewedIds.has(id.toString()));

    const pending = await Booking.find({ _id: { $in: pendingIds } })
      .populate('boat', 'name photos')
      .populate('captain', 'name avatar captainProfile')
      .sort('-endDate')
      .lean();

    res.status(200).json({ success: true, data: pending, count: pending.length });
  } catch (err) {
    next(err);
  }
};
