import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import ConversationMessage from '../models/ConversationMessage.js';
import Boat from '../models/Boat.js';
import { ApiError } from '../utils/ApiError.js';
import { createNotifications } from '../utils/notify.js';

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Resolve owner OR recommendedCaptain server-side — never trust the client.
const resolvePartner = (boat, partnerRole) => {
  if (partnerRole === 'owner') return boat.owner;
  if (partnerRole === 'captain') return boat.recommendedCaptain;
  return null;
};

export const createConversation = async (req, res, next) => {
  try {
    if (req.user.role !== 'customer') {
      throw new ApiError(403, 'Only customers can start a boat inquiry');
    }

    const { boatId, partnerRole } = req.body || {};
    if (!boatId || !isValidObjectId(boatId)) {
      throw new ApiError(400, 'Valid boatId is required');
    }
    if (!['owner', 'captain'].includes(partnerRole)) {
      throw new ApiError(400, "partnerRole must be 'owner' or 'captain'");
    }

    const boat = await Boat.findById(boatId);
    if (!boat) throw new ApiError(404, 'Boat not found');

    const partnerId = resolvePartner(boat, partnerRole);
    if (!partnerId) {
      throw new ApiError(
        400,
        partnerRole === 'captain'
          ? 'This boat has no recommended captain'
          : 'This boat has no owner set'
      );
    }

    // Customers can't open a thread to themselves (defensive).
    if (partnerId.equals(req.user._id)) {
      throw new ApiError(400, 'Cannot message yourself');
    }

    // Get-or-create on the unique (customerId, boatId, partnerId) tuple.
    let conversation = await Conversation.findOne({
      customerId: req.user._id,
      boatId: boat._id,
      partnerId
    });

    if (!conversation) {
      conversation = await Conversation.create({
        customerId: req.user._id,
        boatId: boat._id,
        partnerId,
        partnerRole
      });
    }

    const populated = await Conversation.findById(conversation._id)
      .populate('customerId', 'name avatar role')
      .populate('partnerId', 'name avatar role')
      .populate('boatId', 'name photos');

    res.status(201).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// Throws if the caller isn't a participant. Returns the conversation.
async function getConversationIfParticipant(conversationId, userId) {
  if (!isValidObjectId(conversationId)) {
    throw new ApiError(404, 'Conversation not found');
  }
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) throw new ApiError(404, 'Conversation not found');

  const uid = userId.toString();
  const isParticipant =
    conversation.customerId.toString() === uid ||
    conversation.partnerId.toString() === uid;

  if (!isParticipant) {
    throw new ApiError(403, 'Not a participant in this conversation');
  }
  return conversation;
}

export const sendConversationMessage = async (req, res, next) => {
  try {
    const conversation = await getConversationIfParticipant(
      req.params.id,
      req.user._id
    );

    const raw = (req.body && req.body.body) || '';
    const body = typeof raw === 'string' ? raw.trim() : '';
    if (!body) throw new ApiError(400, 'Message body cannot be empty');
    if (body.length > 2000) {
      throw new ApiError(400, 'Message too long (max 2000 chars)');
    }

    const message = await ConversationMessage.create({
      conversationId: conversation._id,
      senderId: req.user._id,
      body,
      readBy: [req.user._id]
    });

    conversation.lastMessageAt = message.createdAt;
    await conversation.save();

    const populated = await ConversationMessage.findById(message._id)
      .populate('senderId', 'name avatar role');

    res.status(201).json({ success: true, data: populated });

    // ── Fire-and-forget: in-app notify the OTHER party of the inquiry. Pre-booking,
    // so it links the conversation (no relatedBooking). Never blocks the send.
    const senderId = req.user._id.toString();
    const fromCustomer = conversation.customerId.toString() === senderId;
    const recipient     = fromCustomer ? conversation.partnerId : conversation.customerId;
    const recipientRole = fromCustomer ? conversation.partnerRole : 'customer';
    if (recipient && recipient.toString() !== senderId) {
      createNotifications({
        user: recipient,
        role: recipientRole,
        type: 'inquiry',
        title: `New inquiry message from ${req.user.name || 'someone'}`,
        body: body.slice(0, 140),
        relatedConversation: conversation._id
      });
    }
  } catch (err) {
    next(err);
  }
};

export const listMyConversations = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const conversations = await Conversation.find({
      $or: [{ customerId: userId }, { partnerId: userId }]
    })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate('customerId', 'name avatar role')
      .populate('partnerId', 'name avatar role')
      .populate('boatId', 'name photos')
      .lean();

    const withPreviews = await Promise.all(
      conversations.map(async (c) => {
        const last = await ConversationMessage.findOne({ conversationId: c._id })
          .sort('-createdAt')
          .lean();

        // Messages authored by the *other* party that the viewer hasn't
        // marked read. Pre-readBy docs have no field at all, so they
        // correctly match `{ $ne: userId }`.
        const unreadCount = await ConversationMessage.countDocuments({
          conversationId: c._id,
          senderId: { $ne: userId },
          readBy: { $ne: userId }
        });

        const uid = userId.toString();
        const otherParty =
          c.customerId && c.customerId._id.toString() === uid
            ? c.partnerId
            : c.customerId;

        return {
          _id: c._id,
          boat: c.boatId,
          customer: c.customerId,
          partner: c.partnerId,
          partnerRole: c.partnerRole,
          otherParty,
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
      })
    );

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
      if (!Number.isNaN(since.getTime())) {
        filter.createdAt = { $gt: since };
      }
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

export const getInquiryUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const conversationIds = await Conversation.find({
      $or: [{ customerId: userId }, { partnerId: userId }]
    }).distinct('_id');

    const count = await ConversationMessage.countDocuments({
      conversationId: { $in: conversationIds },
      senderId: { $ne: userId },
      readBy: { $ne: userId }
    });

    res.status(200).json({ success: true, data: { count } });
  } catch (err) {
    next(err);
  }
};
