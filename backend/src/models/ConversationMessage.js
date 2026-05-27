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
    }
  },
  { timestamps: true }
);

conversationMessageSchema.index({ conversationId: 1, createdAt: 1 });

const ConversationMessage = mongoose.model(
  'ConversationMessage',
  conversationMessageSchema
);
export default ConversationMessage;
