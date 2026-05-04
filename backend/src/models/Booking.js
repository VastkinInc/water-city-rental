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
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
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
      enum: ['unpaid', 'paid', 'refunded'],
      default: 'unpaid'
    },
    paymentIntentId: { type: String, default: null },
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
  if (
    this.ownerApproved &&
    this.captainApproved &&
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
