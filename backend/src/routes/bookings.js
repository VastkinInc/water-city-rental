import express from 'express';
import {
  createBooking, listMyBookings, getBookingById,
  cancelBooking, approveBooking, declineBooking, completeBooking,
  captainAccept, captainDecline, reassignCaptain
} from '../controllers/bookingController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/role.js';
import { validate } from '../middleware/validate.js';
import {
  createBookingValidator, cancelBookingValidator
} from '../validators/bookingValidator.js';

const router = express.Router();

router.use(protect);

router.post(
  '/',
  restrictTo('customer', 'admin'),
  createBookingValidator,
  validate,
  createBooking
);
router.get('/', listMyBookings);
router.get('/:id', getBookingById);
router.patch('/:id/cancel', cancelBookingValidator, validate, cancelBooking);
router.patch('/:id/approve', approveBooking);
router.patch('/:id/decline', declineBooking);
router.patch('/:id/complete', completeBooking);

router.patch('/:id/captain-accept',   restrictTo('captain', 'admin'), captainAccept);
router.patch('/:id/captain-decline',  restrictTo('captain', 'admin'), captainDecline);
router.patch('/:id/reassign-captain', restrictTo('owner',   'admin'), reassignCaptain);

export default router;
