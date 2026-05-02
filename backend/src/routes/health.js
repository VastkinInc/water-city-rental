import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

router.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'ok',
    service: 'Water City Rental API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    db: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;
