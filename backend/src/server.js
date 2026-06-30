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
import harborsRouter from './routes/harbors.js';
import captainsRouter from './routes/captains.js';
import bookingsRouter from './routes/bookings.js';
import messagesRouter from './routes/messages.js';
import conversationsRouter from './routes/conversations.js';
import inquiriesRouter from './routes/inquiries.js';
import notificationsRouter from './routes/notifications.js';
import reviewsRouter from './routes/reviews.js';
import paymentsRouter from './routes/payments.js';
import connectRouter from './routes/connect.js';
import adminRouter from './routes/admin.js';
import internalRouter from './routes/internal.js';
import { handleStripeWebhook } from './controllers/paymentController.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Security & parsing
app.use(helmet());
// CORS allow list — localhost always allowed; CORS_ORIGIN env var supports
// comma-separated values for multiple production origins.
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  // Production SPA — kept in code so CORS works even if the CORS_ORIGIN env
  // var is unset/misconfigured on the host. www + apex (apex redirects to www).
  'https://www.watercityrental.com',
  'https://watercityrental.com'
];
if (process.env.CORS_ORIGIN) {
  const corsOrigins = process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);
  allowedOrigins.push(...corsOrigins);
}

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      console.error('CORS blocked:', origin);
      return callback(new Error('CORS blocked for origin: ' + origin), false);
    }
    return callback(null, true);
  },
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
app.use('/api/harbors', harborsRouter);
app.use('/api/captains', captainsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/inquiries', inquiriesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/reviews', reviewsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/connect', connectRouter);
app.use('/api/admin', adminRouter);
app.use('/api/internal', internalRouter);

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
