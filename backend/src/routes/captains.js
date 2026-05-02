import express from 'express';
import {
  listCaptains,
  getCaptainById,
  updateMyCaptainProfile
} from '../controllers/captainController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/role.js';

const router = express.Router();

router.get('/', listCaptains);
router.patch('/me/profile', protect, restrictTo('captain'), updateMyCaptainProfile);
router.get('/:id', getCaptainById);

export default router;
