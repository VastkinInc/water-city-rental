import mongoose from 'mongoose';

const timelineEntrySchema = new mongoose.Schema(
  {
    event: { type: String, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    note: { type: String }
  },
  { _id: false }
);

// Note: legacy bookings (pre-Batch 4B) may still have a serviceFee
// field in MongoDB. Safe to ignore — it's no longer read by any
// code. Mongoose doesn't auto-delete keys from existing docs on
// schema removal; new bookings simply won't have it.
const pricingSchema = new mongoose.Schema(
  {
    boatTotal: { type: Number, required: true },
    captainTotal: { type: Number, required: true },
    localTax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    breakdown: { type: mongoose.Schema.Types.Mixed }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingNumber: { type: String, unique: true },
    boat: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Boat',
      required: true
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Batch 4B-1: captain is now optional. When customer chooses "No Captain"
    // at booking time, captain stays null and hasCaptain is set to false.
    // Existing bookings have captain populated; mongoose fills hasCaptain=true
    // on read (default) so legacy data is unchanged.
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      default: null
    },
    hasCaptain: {
      type: Boolean,
      required: true,
      default: true
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    numGuests: { type: Number, required: true, min: 1 },
    days: { type: Number },
    hours: { type: Number },
    pricing: { type: pricingSchema, required: true },
    status: {
      type: String,
      enum: ['pending', 'needs_new_captain', 'confirmed', 'cancelled', 'completed'],
      default: 'pending'
    },
    ownerApproved:   { type: Boolean, default: false },
    captainApproved: { type: Boolean, default: false },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'paid', 'failed', 'refunded', 'partially_refunded'],
      default: 'unpaid'
    },
    paymentIntentId: { type: String, default: null },
    stripeChargeId:  { type: String, default: null },
    paidAt:          { type: Date,   default: null },
    // Payment split P2: amounts that WILL be released to owner/captain in P3.
    // Captured at PaymentIntent creation so P3 can pay out the exact amounts
    // even if pricing or Connect accounts change later. Funds sit on the
    // platform balance (no transfer at checkout) until P3 actually moves them.
    payoutOwnerAmount:            { type: Number, default: 0 },
    payoutCaptainAmount:          { type: Number, default: 0 },
    platformTaxAmount:            { type: Number, default: 0 },
    payoutOwnerStripeAccountId:   { type: String, default: null },
    payoutCaptainStripeAccountId: { type: String, default: null },
    payoutStatus: {
      type: String,
      // 'cancelling' is a transient lock taken when cancelBooking is in flight
      // (after the atomic claim, before Stripe confirms). 'cancelled' is the
      // terminal payout state for any cancelled booking — cron skips both.
      enum: ['held', 'releasing', 'released', 'skipped', 'release_failed', 'cancelling', 'cancelled'],
      default: 'held'
    },
    // Trip end datetime (== endDate). Dedicated field so P3 can read a clear
    // "when did the trip end" timestamp and add its release buffer.
    tripEndAt: { type: Date, default: null },
    // P3 auto-release bookkeeping.
    releaseAttemptedAt: { type: Date,   default: null },
    releasedAt:         { type: Date,   default: null },
    releaseError:       { type: String, default: null },
    ownerTransferId:    { type: String, default: null },
    captainTransferId:  { type: String, default: null },
    cancellationReason: { type: String, maxlength: 500 },
    // Cancellation bookkeeping (added when /cancel endpoint runs to completion).
    cancelledBy:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt:        { type: Date, default: null },
    refundAmount:       { type: Number, default: 0 },   // dollars; 0 means no refund issued
    refundedAt:         { type: Date, default: null },
    stripeRefundId:     { type: String, default: null },
    specialRequests: { type: String, maxlength: 500 },
    timeline: { type: [timelineEntrySchema], default: [] }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

bookingSchema.index({ customer: 1, status: 1 });
bookingSchema.index({ owner: 1, status: 1 });
bookingSchema.index({ captain: 1, status: 1 });
bookingSchema.index({ boat: 1, startDate: 1 });

bookingSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

bookingSchema.methods.checkAndConfirm = function () {
  // No-captain bookings (Batch 4B-1) need only ownerApproved; with-captain
  // bookings still need both ownerApproved AND captainApproved.
  const captainOK = this.hasCaptain === false ? true : this.captainApproved;
  if (
    this.ownerApproved &&
    captainOK &&
    (this.status === 'pending' || this.status === 'needs_new_captain')
  ) {
    this.status = 'confirmed';
    return true;
  }
  return false;
};

bookingSchema.pre('save', async function (next) {
  if (this.bookingNumber) return next();
  try {
    const year = new Date().getFullYear();
    const count = await this.constructor.countDocuments({
      bookingNumber: new RegExp(`^WCR-${year}-`)
    });
    this.bookingNumber = `WCR-${year}-${String(count + 1).padStart(4, '0')}`;
    next();
  } catch (err) {
    next(err);
  }
});

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
