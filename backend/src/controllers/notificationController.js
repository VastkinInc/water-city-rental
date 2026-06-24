import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * GET /api/notifications
 * List the caller's notifications, newest first.
 * Query: ?limit (default 30, max 100), ?unread=1 (only unread),
 *        ?before=<ISO date> (cursor — items strictly older than this).
 */
export const listMyNotifications = async (req, res, next) => {
  try {
    const filter = { user: req.user._id };
    if (req.query.unread === '1' || req.query.unread === 'true') {
      filter.read = false;
    }
    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) {
        filter.createdAt = { $lt: before };
      }
    }

    let limit = parseInt(req.query.limit, 10);
    if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;

    const notifications = await Notification.find(filter)
      // _id is the tie-breaker so ordering is stable when several notifications
      // share a createdAt (e.g. one event fanning out in a single insertMany).
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate('relatedBooking', 'bookingNumber')
      .lean();

    res.status(200).json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/notifications/unread-count
 * Number of unread notifications for the caller. Mirrors the message/inquiry
 * unread-count endpoints so the frontend badge logic is identical.
 */
export const getNotificationUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.countDocuments({
      user: req.user._id,
      read: false
    });
    res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/notifications/:id/read
 * Mark one of the caller's notifications read. Scoped to the caller (user filter),
 * so you can never mark someone else's notification — a non-owned id is a 404.
 */
export const markNotificationRead = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Notification not found');
    }

    const result = await Notification.updateOne(
      { _id: req.params.id, user: req.user._id },
      { $set: { read: true } }
    );
    if (result.matchedCount === 0) {
      throw new ApiError(404, 'Notification not found');
    }

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/notifications/read-all
 * Mark all of the caller's unread notifications read. Returns how many changed.
 */
export const markAllNotificationsRead = async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, read: false },
      { $set: { read: true } }
    );
    res.status(200).json({ success: true, data: { modified: result.modifiedCount } });
  } catch (err) {
    next(err);
  }
};
