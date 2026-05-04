import express from 'express';
import {
  register, login, logout, refresh, getMe,
  updateMyProfile, changePassword
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  registerValidator, loginValidator,
  updateProfileValidator, changePasswordValidator
} from '../validators/authValidator.js';

const router = express.Router();

router.post('/register', registerValidator, validate, register);
router.post('/login',    loginValidator,    validate, login);
router.post('/logout',   logout);
router.post('/refresh',  refresh);
router.get('/me',        protect, getMe);

router.patch('/me',
  protect,
  updateProfileValidator, validate,
  updateMyProfile);

router.post('/change-password',
  protect,
  changePasswordValidator, validate,
  changePassword);

export default router;
