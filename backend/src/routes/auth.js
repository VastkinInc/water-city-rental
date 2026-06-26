import express from 'express';
import {
  register, login, logout, refresh, getMe,
  updateMyProfile, updateMyAvatar, changePassword,
  toggleFavorite, listFavorites, checkFavorite,
  googleAuth, googleCallback,
  forgotPassword, resetPassword
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { uploadAvatar } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  registerValidator, loginValidator,
  updateProfileValidator, changePasswordValidator,
  forgotPasswordValidator, resetPasswordValidator
} from '../validators/authValidator.js';

const router = express.Router();

router.post('/register', registerValidator, validate, register);
router.post('/login',    loginValidator,    validate, login);
router.post('/logout',   logout);
router.post('/refresh',  refresh);

// Password reset (public, no auth)
router.post('/forgot-password', forgotPasswordValidator, validate, forgotPassword);
router.post('/reset-password',  resetPasswordValidator,  validate, resetPassword);

// Google OAuth (public, no auth middleware). consent redirect + callback.
router.get('/google',          googleAuth);
router.get('/google/callback', googleCallback);
router.get('/me',        protect, getMe);

router.patch('/me',
  protect,
  updateProfileValidator, validate,
  updateMyProfile);

// Profile photo upload (all roles). Multipart field "avatar".
router.post('/avatar',
  protect,
  uploadAvatar.single('avatar'),
  updateMyAvatar);

router.post('/change-password',
  protect,
  changePasswordValidator, validate,
  changePassword);

// Favorites (customer-only data, lives under auth)
router.post('/favorites/:boatId',      protect, toggleFavorite);
router.get('/favorites',               protect, listFavorites);
router.get('/favorites/check/:boatId', protect, checkFavorite);

export default router;
