import express from 'express';
import { protect } from '../middleware/auth.js';
import { createPaymentIntent } from '../controllers/paymentController.js';

const router = express.Router();

// Authenticated route
router.post('/create-intent', protect, createPaymentIntent);

export default router;
