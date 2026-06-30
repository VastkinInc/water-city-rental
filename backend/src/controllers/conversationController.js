import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import ConversationMessage from '../models/ConversationMessage.js';
import Boat from '../models/Boat.js';
import { ApiError } from '../utils/ApiError.js';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Participants of a thread = customer + owner + captain (when set).
function participantIds(conv) {
  return [conv.customerId, conv.ownerId, conv.captainId]
    .filter(Boolean)
    .map((x) => String(x._id || x));
}
function isParticipant(conv, userId) {
  return participantIds(conv).includes(String(userId));
}

async function getConversationIfParticipant(conversationId, userId) {
  if (!isValidObjectId(conversationId)) throw new ApiError(404, 'Conversation not found');
  const conv = await Conversation.findById(conversationId);
  if (!conv) throw new ApiError(404, 'Conversation not found');
  if (!isParticipant(conv, userId)) throw new ApiError(403, 'Not a participant in this conversation');
  return conv;
}

/**
 * Booking-flow hook (called fire-and-forget by bookingController): ensure the
 * single (customer, boat) thread exists, link the booking + assigned captain to
 * it, and drop a SYSTEM divider line so everyone sees the before/after boundary.
 * Reassigning swaps the captain. Never throws into the caller.
 *
 * opts: { captainId, bookingId, systemText }
 */
export async function linkBookingToConversation(customerId, boatId, ownerId, opts = {}) {
  try {
    if (!customerId || !boatId || !ownerId) return;
    const { captainId = null, bookingId = null, systemText = '' } = opts;

    let conv = await Conversation.findOne({ customerId, boatId });
    if (!conv) {
      conv = await Conversation.create({ customerId, boatId, ownerId, captainId, bookingId });
    } else {
      if (captainId && String(conv.captainId || '') !== String(captainId)) conv.captainId = captainId;
      if (bookingId) conv.bookingId = bookingId;
      await conv.save();
    }

    if (systemText) {
      const sys = await ConversationMessage.create({
        conversationId: conv._id,
        senderId: customerId,            // an actor is required; rendered as a divider, not a bubble
        kind: 'system',
        body: systemText
      });
      conv.lastMessageAt = sys.createdAt;
      await conv.save();
    }
    return conv;
  } catch (err) {
    console.error('[conversations] linkBookingToConversation failed:', err && err.message);
  }
}

const populateConv = (q) => q
  .populate('customerId', 'name avatar role')
  .populate('ownerId', 'name avatar role')
  .populate('captainId', 'name avatar role')
  .populate('boatId', 'name photos');

/**
 * POST /api/conversations  { boatId }
 * Customer starts (or re-opens) the single thread with the boat's owner. The
 * captain joins later, automatically, when the customer books this boat.
 */
export const createConversation = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      throw new ApiError(403, 'Only customers can start a conversation');
    }
    const { boatId } = req.body || {};
    if (!boatId || !isValidObjectId(boatId)) throw new ApiError(400, 'Valid boatId is required');

    const boat = await Boat.findById(boatId);
    if (!boat) throw new ApiError(404, 'Boat not found');
    if (!boat.owner) throw new ApiError(400, 'This boat has no owner set');
    if (boat.owner.equals(req.user._id)) throw new ApiError(400, 'Cannot message your own boat');

    let conv = await Conversation.findOne({ customerId: req.user._id, boatId: boat._id });
    if (!conv) {
      conv = await Conversation.create({
        customerId: req.user._id,
        boatId: boat._id,
        ownerId: boat.owner
      });
    }

    const populated = await populateConv(Conversation.findById(conv._id));
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const sendConversationMessage = async (req, res, next) => {
  try {
    const conv = await getConversationIfParticipant(req.params.id, req.user._id);

    const raw = (req.body && req.body.body) || '';
    const body = typeof raw === 'string' ? raw.trim() : '';
    if (!body) throw new ApiError(400, 'Message body cannot be empty');
    if (body.length > 2000) throw new ApiError(400, 'Message too long (max 2000 chars)');

    const message = await ConversationMessage.create({
      conversationId: conv._id,
      senderId: req.user._id,
      body,
      readBy: [req.user._id]
    });

    conv.lastMessageAt = message.createdAt;
    await conv.save();

    const populated = await ConversationMessage.findById(message._id)
      .populate('senderId', 'name avatar role');
    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

export const listMyConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const conversations = await populateConv(
      Conversation.find({
        $or: [{ customerId: userId }, { ownerId: userId }, { captainId: userId }]
      }).sort({ lastMessageAt: -1, updatedAt: -1 })
    ).lean();

    const withPreviews = await Promise.all(conversations.map(async (c) => {
      const last = await ConversationMessage.findOne({ conversationId: c._id })
        .sort('-createdAt').lean();
      const unreadCount = await ConversationMessage.countDocuments({
        conversationId: c._id,
        kind: { $ne: 'system' },
        senderId: { $ne: userId },
        readBy: { $ne: userId }
      });

      const uid = String(userId);
      const parties = [c.customerId, c.ownerId, c.captainId].filter(Boolean);
      const others = parties.filter((p) => String(p._id) !== uid);

      return {
        _id: c._id,
        boat: c.boatId,
        customer: c.customerId,
        owner: c.ownerId,
        captain: c.captainId,
        bookingId: c.bookingId || null,
        // No booking yet → still a pre-booking inquiry; once booked → a trip chat.
        isInquiry: !c.bookingId,
        participants: parties,
        otherParties: others,
        // Back-compat with the old 1:1 UI: a single "otherParty" to show.
        otherParty: others[0] || null,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: last
          ? {
              body: last.body.length > 140 ? last.body.slice(0, 140) + '…' : last.body,
              createdAt: last.createdAt,
              senderId: last.senderId
            }
          : null,
        unreadCount,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt
      };
    }));

    res.status(200).json({ success: true, data: withPreviews });
  } catch (err) {
    next(err);
  }
};

export const listConversationMessages = async (req, res, next) => {
  try {
    await getConversationIfParticipant(req.params.id, req.user._id);

    const filter = { conversationId: req.params.id };
    if (req.query.since) {
      const since = new Date(req.query.since);
      if (!Number.isNaN(since.getTime())) filter.createdAt = { $gt: since };
    }
    const messages = await ConversationMessage.find(filter)
      .sort('createdAt')
      .populate('senderId', 'name avatar role')
      .lean();
    res.status(200).json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
};

export const markConversationRead = async (req, res, next) => {
  try {
    await getConversationIfParticipant(req.params.id, req.user._id);
    await ConversationMessage.updateMany(
      { conversationId: req.params.id, readBy: { $ne: req.user._id } },
      { $addToSet: { readBy: req.user._id } }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

// Name kept for the existing route import. Counts unread across all of the
// caller's threads (as customer, owner, or captain).
export const getInquiryUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const conversationIds = await Conversation.find({
      $or: [{ customerId: userId }, { ownerId: userId }, { captainId: userId }]
    }).distinct('_id');

    const count = await ConversationMessage.countDocuments({
      conversationId: { $in: conversationIds },
      kind: { $ne: 'system' },
      senderId: { $ne: userId },
      readBy: { $ne: userId }
    });
    res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
};
