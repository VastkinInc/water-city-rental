import express from 'express';
import { listCities, listHarbors } from '../controllers/harborController.js';

const router = express.Router();

router.get('/cities', listCities);
router.get('/', listHarbors);

export default router;
