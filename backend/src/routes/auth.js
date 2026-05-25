import express from 'express';
import {
  register, login, logout, refresh, getMe,
  updateMyProfile, changePassword,
  toggleFavorite, listFavorites, checkFavorite,
  googleAuth, googleCallback
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

// Google OAuth (public, no auth middleware). consent redirect + callback.
router.get('/google',          googleAuth);
router.get('/google/callback', googleCallback);
router.get('/me',        protect, getMe);

router.patch('/me',
  protect,
  updateProfileValidator, validate,
  updateMyProfile);

router.post('/change-password',
  protect,
  changePasswordValidator, validate,
  changePassword);

// Favorites (customer-only data, lives under auth)
router.post('/favorites/:boatId',      protect, toggleFavorite);
router.get('/favorites',               protect, listFavorites);
router.get('/favorites/check/:boatId', protect, checkFavorite);

export default router;
