import mongoose from 'mongoose';

const harborSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Harbor name is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City label is required'],
      trim: true
    },
    cityKey: {
      type: String,
      required: [true, 'cityKey is required'],
      trim: true,
      lowercase: true,
      index: true
    },
    isPreliminary: { type: Boolean, default: false },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

harborSchema.index({ cityKey: 1, name: 1 }, { unique: true });

harborSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

harborSchema.set('toJSON', { virtuals: true });
harborSchema.set('toObject', { virtuals: true });

const Harbor = mongoose.model('Harbor', harborSchema);
export default Harbor;
