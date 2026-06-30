import express from 'express';
import { createInquiry, listInquiries, updateInquiryStatus } from '../controllers/inquiryController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/role.js';

const router = express.Router();

// PUBLIC — no auth: anyone can send the platform an inquiry.
router.post('/', createInquiry);

// Admin — review/handle inquiries internally.
router.get('/', protect, restrictTo('admin'), listInquiries);
router.patch('/:id', protect, restrictTo('admin'), updateInquiryStatus);

export default router;
