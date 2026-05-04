import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  listConversations,
  getConversation,
  sendMessage,
  markConversationRead,
  getUnreadCount
} from '../controllers/messageController.js';

const router = express.Router();

router.use(protect);

router.get('/unread-count',                    getUnreadCount);
router.get('/conversations',                   listConversations);
router.get('/conversations/:bookingId',        getConversation);
router.post('/',                               sendMessage);
router.patch('/conversations/:bookingId/read', markConversationRead);

export default router;
