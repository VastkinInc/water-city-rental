import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Booking from '../models/Booking.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Verify the user is a participant of the booking (customer / owner / captain),
 * or admin. Returns the populated booking. Throws ApiError otherwise.
 */
async function getBookingIfParticipant(bookingId, userId, userRole) {
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, 'Invalid booking ID');
  }
  const booking = await Booking.findById(bookingId)
    .populate('boat', 'name photos owner')
    .populate('customer', 'name avatar role')
    .populate('owner', 'name avatar role')
    .populate('captain', 'name avatar role');
  if (!booking) throw new ApiError(404, 'Booking not found');

  const uid = userId.toString();
  const isParticipant =
    (booking.customer && booking.customer._id.toString() === uid) ||
    (booking.owner    && booking.owner._id.toString()    === uid) ||
    (booking.captain  && booking.captain._id.toString()  === uid) ||
    userRole === 'admin';

  if (!isParticipant) {
    throw new ApiError(403, 'Not a participant in this booking');
  }
  return booking;
}

/**
 * GET /api/messages/conversations
 * List all bookings the user has access to with last message + unread count.
 */
export const listConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const role   = req.user.role;

    const filter = {};
    if (role === 'customer') filter.customer = userId;
    else if (role === 'owner')   filter.owner   = userId;
    else if (role === 'captain') filter.captain = userId;
    // admin sees all (no role filter)

    // Only surface bookings that represent a REAL conversation thread. Unpaid/
    // abandoned-cart bookings (a customer can pile up many on the same boat)
    // would otherwise each show as an empty "No messages yet" card. Mirrors the
    // paid-gating already used in bookingController.listMyBookings. The broader
    // set keeps cancelled-but-paid / refunded trips' chat history reachable.
    filter.paymentStatus = { $in: ['paid', 'refunded', 'partially_refunded'] };

    const bookings = await Booking.find(filter)
      .populate('boat', 'name photos')
      .populate('customer', 'name avatar')
      .populate('owner', 'name avatar')
      .populate('captain', 'name avatar')
      .sort('-updatedAt')
      .lean();

    const conversations = await Promise.all(
      bookings.map(async (b) => {
        const lastMessage = await Message.findOne({ booking: b._id })
          .sort('-createdAt')
          .populate('sender', 'name avatar role')
          .lean();

        const unreadCount = await Message.countDocuments({
          booking: b._id,
          sender: { $ne: userId },
          readBy: { $ne: userId }
        });

        return {
          bookingId: b._id,
          bookingNumber: b.bookingNumber,
          boat: b.boat,
          customer: b.customer,
          owner: b.owner,
          captain: b.captain,
          status: b.status,
          startDate: b.startDate,
          endDate: b.endDate,
          lastMessage,
          unreadCount,
          updatedAt: b.updatedAt
        };
      })
    );

    // Threads with messages float above empty bookings; both sorted recency-first.
    conversations.sort((a, b) => {
      const aTime = a.lastMessage ? new Date(a.lastMessage.createdAt) : new Date(a.updatedAt);
      const bTime = b.lastMessage ? new Date(b.lastMessage.createdAt) : new Date(b.updatedAt);
      return bTime - aTime;
    });

    res.status(200).json({ success: true, data: conversations });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/messages/conversations/:bookingId
 * Fetch a single thread (chronological). Verifies participant access.
 */
export const getConversation = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const booking = await getBookingIfParticipant(bookingId, req.user._id, req.user.role);

    const messages = await Message.find({ booking: bookingId })
      .populate('sender', 'name avatar role')
      .sort('createdAt')
      .lean();

    res.status(200).json({
      success: true,
      data: {
        booking: {
          _id: booking._id,
          bookingNumber: booking.bookingNumber,
          boat: booking.boat,
          customer: booking.customer,
          owner: booking.owner,
          captain: booking.captain,
          status: booking.status,
          startDate: booking.startDate,
          endDate: booking.endDate
        },
        messages
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/messages
 * Send a message in a booking thread.
 */
export const sendMessage = async (req, res, next) => {
  try {
    const { bookingId, content } = req.body;
    if (!content || !content.trim()) {
      throw new ApiError(400, 'Message content cannot be empty');
    }
    if (content.length > 2000) {
      throw new ApiError(400, 'Message too long (max 2000 chars)');
    }

    const booking = await getBookingIfParticipant(bookingId, req.user._id, req.user.role);

    const message = await Message.create({
      booking: booking._id,
      sender: req.user._id,
      content: content.trim(),
      readBy: [req.user._id] // sender has implicitly read their own message
    });

    // Bump booking's updatedAt so its thread floats to top.
    await Booking.findByIdAndUpdate(booking._id, { updatedAt: new Date() });

    const populated = await Message.findById(message._id)
      .populate('sender', 'name avatar role');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/messages/conversations/:bookingId/read
 * Mark all messages in a thread as read by the current user.
 */
export const markConversationRead = async (req, res, next) => {
  try {
    const { bookingId } = req.params;
    const userId = req.user._id;
    await getBookingIfParticipant(bookingId, userId, req.user.role);

    await Message.updateMany(
      { booking: bookingId, readBy: { $ne: userId } },
      { $addToSet: { readBy: userId } }
    );

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/messages/unread-count
 * Total unread messages across all of the user's threads (for sidebar badge).
 */
export const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const role   = req.user.role;

    const filter = {};
    if (role === 'customer') filter.customer = userId;
    else if (role === 'owner')   filter.owner   = userId;
    else if (role === 'captain') filter.captain = userId;

    // Match listConversations: only count unread against real (paid) threads, so
    // the badge never reflects unpaid/abandoned bookings that aren't shown.
    filter.paymentStatus = { $in: ['paid', 'refunded', 'partially_refunded'] };

    const bookingIds = await Booking.find(filter).distinct('_id');

    const count = await Message.countDocuments({
      booking: { $in: bookingIds },
      sender: { $ne: userId },
      readBy: { $ne: userId }
    });

    res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
};
