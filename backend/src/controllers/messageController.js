import mongoose from 'mongoose';
import Message from '../models/Message.js';
import Booking from '../models/Booking.js';
import { ApiError } from '../utils/ApiError.js';
import { createNotifications } from '../utils/notify.js';

// An "active paid trip" has a real chat room even before the first message:
// the booking is paid AND in a live/finished trip state (not pending/cancelled).
// Conversations also surface for any booking that already has messages — see
// listConversations. Shared so the unread badge counts the same threads shown.
const ACTIVE_TRIP_STATUSES = ['confirmed', 'needs_new_captain', 'completed'];
function isActivePaidTrip(b) {
  return b.paymentStatus === 'paid' && ACTIVE_TRIP_STATUSES.includes(b.status);
}

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

    const candidates = await Booking.find(filter)
      .populate('boat', 'name photos')
      .populate('customer', 'name avatar')
      .populate('owner', 'name avatar')
      .populate('captain', 'name avatar')
      .sort('-updatedAt')
      .lean();

    // A booking surfaces as a conversation only if it's a REAL thread:
    //   (a) it's an ACTIVE PAID TRIP — paid + status confirmed/needs_new_captain/
    //       completed → the chat room exists for the trip's parties, OR
    //   (b) it ALREADY HAS at least one message — preserve any started chat
    //       regardless of status (e.g. a cancelled trip people talked in).
    // This drops unpaid/abandoned-cart bookings that otherwise each render as an
    // empty "No messages yet" card. (isActivePaidTrip is shared with getUnreadCount.)
    const messagedIds = new Set(
      (await Message.distinct('booking', { booking: { $in: candidates.map((b) => b._id) } }))
        .map((id) => String(id))
    );
    const bookings = candidates.filter(
      (b) => isActivePaidTrip(b) || messagedIds.has(String(b._id))
    );

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

    // ── Fire-and-forget: in-app notify the OTHER booking participants. Mirrors
    // the mailer pattern — runs after the response, never blocks or fails the send.
    const senderId = req.user._id.toString();
    const senderName = req.user.name || 'Someone';
    const parties = [
      booking.customer && { u: booking.customer, role: 'customer' },
      booking.owner    && { u: booking.owner,    role: 'owner' },
      booking.captain  && { u: booking.captain,  role: 'captain' }
    ].filter(Boolean);
    const entries = parties
      .filter((p) => p.u._id && p.u._id.toString() !== senderId)
      .map((p) => ({
        user: p.u._id,
        role: p.role,
        type: 'message',
        title: `New message from ${senderName}`,
        body: content.trim().slice(0, 140),
        relatedBooking: booking._id
      }));
    createNotifications(entries);
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

    // No payment/status filter needed here: only bookings that HAVE messages can
    // contribute unread, and listConversations always shows any messaged booking
    // (clause b). So counting unread across all the user's bookings exactly
    // matches the visible thread set — message-less bookings contribute zero.
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
