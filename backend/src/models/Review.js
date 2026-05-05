import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    unique: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  boat: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Boat',
    required: true,
    index: true
  },
  captain: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  boatRating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  boatComment: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  captainRating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  captainComment: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  }
}, { timestamps: true });

export default mongoose.model('Review', reviewSchema);
