import mongoose from 'mongoose';

// ONE continuous thread per (customer, boat). The owner is always a participant;
// the captain JOINS the same thread once the customer books that boat with a
// captain (see bookingController -> ensureCaptainInConversation). So a pre-booking
// customer↔owner chat seamlessly becomes a customer+owner+captain group chat.
const conversationSchema = new mongoose.Schema(
  {
    boatId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Boat', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ownerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Null until the customer books this boat with a captain. Then that captain
    // joins this same thread. Reassigning a captain swaps this id.
    captainId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set once the customer books this boat. null = still a pre-booking inquiry.
    // Lets the UI label each thread "Inquiry" vs "Booked trip".
    bookingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    lastMessageAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Exactly one thread per (customer, boat).
conversationSchema.index({ customerId: 1, boatId: 1 }, { unique: true });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
