import express from 'express';
import {
  listCaptains,
  listPublicCaptains,
  getCaptainById,
  updateMyCaptainProfile
} from '../controllers/captainController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/role.js';

const router = express.Router();

router.get('/', listCaptains);
// Public directory — no auth. Must precede '/:id' so 'public' isn't read as an id.
router.get('/public', listPublicCaptains);
router.patch('/me/profile', protect, restrictTo('captain'), updateMyCaptainProfile);
router.get('/:id', getCaptainById);

export default router;
