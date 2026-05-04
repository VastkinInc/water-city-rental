import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const captainProfileSchema = new mongoose.Schema(
  {
    dayRate: { type: Number, min: 0 },
    hourlyRate: { type: Number, min: 0 },
    yearsExperience: { type: Number, min: 0 },
    licenseNumber: { type: String, trim: true },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalTrips: { type: Number, default: 0, min: 0 },
    bio: { type: String, trim: true },
    languages: { type: [String], default: undefined }
  },
  { _id: false }
);

const ownerProfileSchema = new mongoose.Schema(
  {
    harbor: { type: String, trim: true, default: '' },
    numBoats: { type: Number, default: 0, min: 0, max: 100 },
    yearsOwning: { type: Number, default: 0, min: 0, max: 70 }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Invalid email format']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false
    },
    role: {
      type: String,
      enum: ['customer', 'owner', 'captain', 'admin'],
      default: 'customer'
    },
    phone: { type: String, trim: true },
    avatar: { type: String, trim: true },
    city: { type: String, trim: true, default: 'Chicago' },
    bio: { type: String, trim: true },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    captainProfile: { type: captainProfileSchema, default: undefined },
    ownerProfile: { type: ownerProfileSchema, default: undefined }
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.comparePassword = function (plainPwd) {
  return bcrypt.compare(plainPwd, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

const User = mongoose.model('User', userSchema);
export default User;
