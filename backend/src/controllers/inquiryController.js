import Inquiry from '../models/Inquiry.js';
import { ApiError } from '../utils/ApiError.js';
import { sendMail } from '../utils/mailer.js';

const STATUSES = ['new', 'in_progress', 'resolved'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/inquiries  (PUBLIC — no auth)
 * Anyone can send Water City Rental a platform inquiry. Stored for admins and
 * emailed to the platform inbox (fire-and-forget, never blocks the response).
 */
export const createInquiry = async (req, res, next) => {
  try {
    const { name, email, phone, subject, message } = req.body || {};
    if (!name || !name.trim()) throw new ApiError(400, 'Please enter your name');
    if (!email || !EMAIL_RE.test(String(email).trim())) throw new ApiError(400, 'Please enter a valid email');
    if (!message || !message.trim()) throw new ApiError(400, 'Please enter a message');

    const inquiry = await Inquiry.create({
      name: name.trim(),
      email: String(email).trim().toLowerCase(),
      phone: (phone || '').trim(),
      subject: (subject || '').trim(),
      message: message.trim(),
      submittedBy: (req.user && req.user._id) || null
    });

    // Notify the platform inbox so the team can solve it internally.
    const to = process.env.INQUIRY_INBOX || process.env.MAIL_FROM_ADDR || process.env.ADMIN_EMAIL;
    if (to) {
      const esc = (s) => String(s || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
      sendMail({
        to,
        subject: 'New inquiry: ' + (inquiry.subject || 'General question'),
        html:
          `<p><strong>From:</strong> ${esc(inquiry.name)} ` +
          `(<a href="mailto:${esc(inquiry.email)}">${esc(inquiry.email)}</a>` +
          `${inquiry.phone ? ', ' + esc(inquiry.phone) : ''})</p>` +
          `<p><strong>Subject:</strong> ${esc(inquiry.subject || '—')}</p>` +
          `<p style="white-space:pre-wrap">${esc(inquiry.message)}</p>`
      }).catch(() => { /* never block the user's submission */ });
    }

    res.status(201).json({
      success: true,
      message: "Thanks! Your message has been sent to Water City Rental. We'll get back to you soon."
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/inquiries  (admin) — list inquiries, newest first. ?status filter.
 */
export const listInquiries = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status && STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const inquiries = await Inquiry.find(filter).sort({ createdAt: -1 }).limit(200).lean();
    res.status(200).json({ success: true, data: inquiries });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/inquiries/:id  (admin) — update the status as the team works it.
 */
export const updateInquiryStatus = async (req, res, next) => {
  try {
    const { status } = req.body || {};
    if (!STATUSES.includes(status)) throw new ApiError(400, 'Invalid status');
    const inquiry = await Inquiry.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!inquiry) throw new ApiError(404, 'Inquiry not found');
    res.status(200).json({ success: true, data: inquiry });
  } catch (err) {
    next(err);
  }
};
