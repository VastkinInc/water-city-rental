import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  createConversation,
  sendConversationMessage,
  listMyConversations,
  listConversationMessages
} from '../controllers/conversationController.js';

const router = express.Router();

router.use(protect);

router.get('/',                 listMyConversations);
router.post('/',                createConversation);
router.get('/:id/messages',     listConversationMessages);
router.post('/:id/messages',    sendConversationMessage);

export default router;
