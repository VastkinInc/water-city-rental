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

const pricingSchema = new mongoose.Schema(
  {
    boatTotal: { type: Number, required: true },
    captainTotal: { type: Number, required: true },
    serviceFee: { type: Number, required: true },
    // Batch 4B-1: new tax fields. localTax replaces serviceFee economically;
    // serviceFee kept at 0 for backwards-compat (frontend Batch 4B-2 will switch).
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
      enum: ['unpaid', 'paid', 'failed', 'refunded'],
      default: 'unpaid'
    },
    paymentIntentId: { type: String, default: null },
    stripeChargeId:  { type: String, default: null },
    paidAt:          { type: Date,   default: null },
    cancellationReason: { type: String, maxlength: 500 },
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
