import express from 'express';
import { requirePingerSecret } from '../middleware/pingerAuth.js';
import { releaseDueTrips } from '../controllers/internalController.js';

const router = express.Router();

// Server-to-server only — auth is the shared pinger secret, NOT user JWT.
router.post('/release-due-trips', requirePingerSecret, releaseDueTrips);

export default router;
