import mongoose from 'mongoose';

// In-app notification. One row PER RECIPIENT (unlike Message's readBy[] array) so
// the bell list and unread-count are a trivial per-user query. Created by the
// fire-and-forget emitter in utils/notify.js at the same hook points the mailer
// uses; nothing in the request path ever depends on a notification being written.
export const NOTIFICATION_TYPES = [
  'message',            // new message on a booking thread
  'inquiry',            // new pre-booking inquiry / inquiry message
  'booking_confirmed',  // booking reached 'confirmed'
  'owner_approved',
  'owner_declined',
  'captain_approved',
  'captain_declined',
  'refund_issued'
];

const notificationSchema = new mongoose.Schema(
  {
    // Recipient. Required + indexed — every query is "my notifications".
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    // Recipient's role at send time (a user has one role here, but snapshotting
    // keeps the notification self-describing for filtering/auditing).
    role: {
      type: String,
      enum: ['customer', 'owner', 'captain', 'admin'],
      required: true
    },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', trim: true, maxlength: 1000 },
    // Optional deep-link targets — the bell links to whichever is set.
    relatedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    },
    relatedConversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null
    },
    read: { type: Boolean, default: false }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Bell list (newest first) and unread-count both hit {user, read} — one index serves both.
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

notificationSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
