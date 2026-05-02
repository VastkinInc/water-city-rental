import express from 'express';
import {
  createBoat, listBoats, getBoatById, updateBoat, deleteBoat,
  getMyBoats, deleteBoatPhoto, updateBoatStatus
} from '../controllers/boatController.js';
import { protect } from '../middleware/auth.js';
import { restrictTo } from '../middleware/role.js';
import { upload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { createBoatValidator, updateBoatValidator } from '../validators/boatValidator.js';

const router = express.Router();

router.get('/', listBoats);
router.get('/me/list', protect, restrictTo('owner', 'admin'), getMyBoats);
router.get('/:id', getBoatById);

router.post(
  '/',
  protect,
  restrictTo('owner', 'admin'),
  upload.array('photos', 10),
  createBoatValidator,
  validate,
  createBoat
);

router.patch(
  '/:id',
  protect,
  upload.array('photos', 10),
  updateBoatValidator,
  validate,
  updateBoat
);

router.delete('/:id', protect, deleteBoat);
router.delete('/:id/photos/:publicId', protect, deleteBoatPhoto);

router.patch('/:id/status', protect, restrictTo('admin'), updateBoatStatus);

export default router;
