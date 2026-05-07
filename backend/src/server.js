import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { connectDB } from './config/db.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';

import healthRouter from './routes/health.js';
import authRouter from './routes/auth.js';
import boatsRouter from './routes/boats.js';
import captainsRouter from './routes/captains.js';
import bookingsRouter from './routes/bookings.js';
import messagesRouter from './routes/messages.js';
import reviewsRouter from './routes/reviews.js';
import paymentsRouter from './routes/payments.js';
import { handleStripeWebhook } from './controllers/paymentController.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Security & parsing
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true
}));

// Stripe webhook needs the RAW body for signature verification —
// mount it BEFORE express.json() so the body isn't pre-parsed.
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

// Routes
app.get('/', (req, res) => {
  res.json({
    message: '🚢 Water City Rental API',
    health: '/api/health',
    docs: 'coming soon'
  });
});

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/boats', boatsRouter);
app.use('/api/captains', captainsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/payments', paymentsRouter);

// Error handlers (must be last)
app.use(notFound);
app.use(errorHandler);

// Start server after DB connects
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`🚢 Water City Rental API`);
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('═══════════════════════════════════════════');
    console.log('');
  });
};

startServer();
