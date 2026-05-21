import express from 'express';
import { getStats, getUsers, getBoats, getBookings } from '../controllers/adminController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/role.js';

const router = express.Router();

// Every admin route requires an authenticated admin user.
router.use(protect, restrictTo('admin'));

// Read-only data endpoints (GET only).
router.get('/stats', getStats);
router.get('/users', getUsers);
router.get('/boats', getBoats);
router.get('/bookings', getBookings);

export default router;
