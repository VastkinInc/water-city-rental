import mongoose from 'mongoose';

// Separate from the booking-scoped Message model — this one lives on a
// Conversation (boat inquiry thread, no booking required).
const conversationMessageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000
    },
    // 'message' = a real chat message from a participant. 'system' = an
    // auto-inserted divider (e.g. "Booking made · Captain joined") that marks the
    // before/after-booking boundary. System lines are rendered differently and
    // never count toward unread badges.
    kind: {
      type: String,
      enum: ['message', 'system'],
      default: 'message'
    },
    // Mirrors readBy on the booking-scoped Message model. Optional field —
    // older docs created before this change simply have no readBy and are
    // treated as unread for everyone but the sender (counts still work).
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  { timestamps: true }
);

conversationMessageSchema.index({ conversationId: 1, createdAt: 1 });

const ConversationMessage = mongoose.model(
  'ConversationMessage',
  conversationMessageSchema
);
export default ConversationMessage;
