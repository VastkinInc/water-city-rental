import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createReview, listBoatReviews, listCaptainReviews,
  getBookingReview, getMyPendingReviews
} from '../controllers/reviewController.js';

const router = express.Router();

// Public read routes
router.get('/boat/:boatId',       listBoatReviews);
router.get('/captain/:captainId', listCaptainReviews);

// Protected routes
router.use(protect);
router.post('/',                  createReview);
router.get('/booking/:bookingId', getBookingReview);
router.get('/my-pending',         getMyPendingReviews);

export default router;
