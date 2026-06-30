import mongoose from 'mongoose';

// Public platform inquiry — anyone (signed in or not) can send Water City Rental
// a question/message from the public site. Handled internally by admins (not a
// per-boat customer↔owner thread; that's the separate Conversation model).
const inquirySchema = new mongoose.Schema(
  {
    name:    { type: String, required: true, trim: true, maxlength: 120 },
    email:   { type: String, required: true, trim: true, lowercase: true, maxlength: 200 },
    phone:   { type: String, trim: true, default: '', maxlength: 40 },
    subject: { type: String, trim: true, default: '', maxlength: 200 },
    message: { type: String, required: true, trim: true, maxlength: 4000 },
    status:  { type: String, enum: ['new', 'in_progress', 'resolved'], default: 'new' },
    // Optional: set when a logged-in user submits, for context only.
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

inquirySchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Inquiry', inquirySchema);
