import express from 'express';
import { register, login, logout, refresh, getMe } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerValidator, loginValidator } from '../validators/authValidator.js';

const router = express.Router();

router.post('/register', registerValidator, validate, register);
router.post('/login',    loginValidator,    validate, login);
router.post('/logout',   logout);
router.post('/refresh',  refresh);
router.get('/me',        protect, getMe);

export default router;
