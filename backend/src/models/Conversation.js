import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    boatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boat',
      required: true
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    partnerRole: {
      type: String,
      enum: ['owner', 'captain'],
      required: true
    },
    lastMessageAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// One thread per (customer, boat, partner). If a customer messages the
// boat's owner AND the boat's recommended captain, that's two distinct
// conversations because partnerId differs.
conversationSchema.index(
  { customerId: 1, boatId: 1, partnerId: 1 },
  { unique: true }
);

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
