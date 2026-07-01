import mongoose from 'mongoose';

// Two thread shapes share this model:
//  1) BOAT thread — one per (customer, boat). Owner is always a participant; the
//     captain JOINS once the customer books that boat with a captain. A pre-booking
//     customer↔owner chat seamlessly becomes a customer+owner+captain group chat.
//  2) CAPTAIN-DIRECT thread — a customer messages a captain from their profile
//     (no boat/owner). {customerId, captainId}, boatId/ownerId null.
const conversationSchema = new mongoose.Schema(
  {
    // Set for boat threads; null for captain-direct threads.
    boatId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Boat', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Set for boat threads; null for captain-direct threads.
    ownerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Boat thread: null until booked with a captain (then the captain joins).
    // Captain-direct thread: the captain being messaged.
    captainId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set once the customer books this boat. null = still a pre-booking inquiry.
    // Lets the UI label each thread "Inquiry" vs "Booked trip".
    bookingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    lastMessageAt: { type: Date, default: null }
  },
  { timestamps: true }
);

// Non-unique lookup indexes. Uniqueness (one thread per customer+boat, and per
// customer+captain-direct) is enforced by get-or-create in the controller — a DB
// unique index on (customerId, boatId) would collide across boat-less captain
// threads (both have boatId null). The old unique index is dropped by
// scripts/migrate-conversation-index.mjs.
conversationSchema.index({ customerId: 1, boatId: 1 });
conversationSchema.index({ captainId: 1 });

const Conversation = mongoose.model('Conversation', conversationSchema);
export default Conversation;
