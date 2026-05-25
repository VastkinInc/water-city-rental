import express from 'express';
import { onboard, getStatus } from '../controllers/connectController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/role.js';

const router = express.Router();

// Stripe Connect onboarding — owners and captains only.
router.post('/onboard', protect, restrictTo('owner', 'captain'), onboard);
router.get('/status', protect, restrictTo('owner', 'captain'), getStatus);

export default router;
