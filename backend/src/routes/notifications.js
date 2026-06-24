import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  listMyNotifications,
  getNotificationUnreadCount,
  markNotificationRead,
  markAllNotificationsRead
} from '../controllers/notificationController.js';

const router = express.Router();

router.use(protect);

// Specific paths before the parameterized one.
router.get('/unread-count', getNotificationUnreadCount);
router.patch('/read-all',   markAllNotificationsRead);
router.get('/',             listMyNotifications);
router.patch('/:id/read',   markNotificationRead);

export default router;
