import mongoose from 'mongoose';

export const BOAT_TYPES = [
  'Luxury Yacht', 'Catamaran', 'Sailboat',
  'Powerboat', 'Day Cruiser', 'Speedboat', 'Jet Ski'
];

export const HARBORS = [
  'Monroe Harbor', 'Navy Pier', 'Belmont Harbor',
  'Burnham Harbor', 'Diversey Harbor', 'DuSable Harbor'
];

const photoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, default: '' }
  },
  { _id: false }
);

const boatSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Boat name is required'],
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    type: {
      type: String,
      required: [true, 'Boat type is required'],
      enum: BOAT_TYPES
    },
    yearBuilt: {
      type: Number,
      min: 1950,
      max: new Date().getFullYear() + 1
    },
    length: { type: Number, min: 10, max: 200 },
    maxGuests: {
      type: Number,
      required: [true, 'Max guests is required'],
      min: 1,
      max: 50
    },
    harbor: {
      type: String,
      required: [true, 'Harbor is required'],
      enum: HARBORS
    },
    description: { type: String, trim: true, maxlength: 2000 },
    amenities: { type: [String], default: [] },
    photos: { type: [photoSchema], default: [] },
    rateType: {
      type: String,
      enum: ['daily', 'hourly'],
      default: 'daily'
    },
    dayRate: {
      type: Number,
      min: 0,
      required: function () { return this.rateType === 'daily'; }
    },
    hourlyRate: {
      type: Number,
      min: 0,
      required: function () { return this.rateType === 'hourly'; }
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    recommendedCaptain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'inactive'],
      default: 'pending'
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalBookings: { type: Number, default: 0, min: 0 }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

boatSchema.index({ harbor: 1, type: 1, status: 1 });

boatSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

const Boat = mongoose.model('Boat', boatSchema);
export default Boat;
