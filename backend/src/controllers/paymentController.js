import Stripe from 'stripe';
import mongoose from 'mongoose';
import Booking from '../models/Booking.js';
import { ApiError } from '../utils/ApiError.js';

// Single shared Stripe client. Connect onboarding (connectController) imports
// this same instance — there is intentionally only one `new Stripe(...)` call.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/payments/create-intent
 * Creates (or refreshes) a Stripe payment intent for a booking owned
 * by the authenticated customer. Returns the client_secret for Stripe Elements.
 */
export const createPaymentIntent = async (req, res, next) => {
  try {
    const { bookingId } = req.body;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(bookingId)) {
      throw new ApiError(400, 'Invalid booking ID');
    }

    const booking = await Booking.findById(bookingId)
      .populate('boat', 'name')
      .populate('captain', 'name');
    if (!booking) throw new ApiError(404, 'Booking not found');

    if (booking.customer.toString() !== userId.toString()) {
      throw new ApiError(403, 'Only the customer can pay for this booking');
    }

    if (booking.paymentStatus === 'paid') {
      throw new ApiError(400, 'This booking is already paid');
    }

    const grandTotal = (booking.pricing && booking.pricing.grandTotal) || 0;
    const amount = Math.round(grandTotal * 100); // Stripe expects cents
    if (amount < 50) {
      throw new ApiError(400, 'Amount must be at least $0.50');
    }

    let paymentIntent;
    if (booking.paymentIntentId) {
      try {
        paymentIntent = await stripe.paymentIntents.update(
          booking.paymentIntentId,
          { amount, currency: 'usd' }
        );
      } catch (err) {
        // If the existing intent can't be updated (e.g. already succeeded/cancelled),
        // create a fresh one.
        console.warn('[Stripe] Could not update existing intent, creating new:', err.message);
        paymentIntent = null;
      }
    }

    if (!paymentIntent) {
      paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
        metadata: {
          bookingId: booking._id.toString(),
          bookingNumber: booking.bookingNumber || '',
          customerId: userId.toString(),
          boatName: (booking.boat && booking.boat.name) || ''
        }
      });
      booking.paymentIntentId = paymentIntent.id;
      await booking.save();
    }

    res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        amount: amount,
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
      }
    });
  } catch (err) {
    console.error('[Stripe] createPaymentIntent error:', err.message);
    next(err);
  }
};

/**
 * POST /api/payments/webhook
 * Stripe POSTs payment lifecycle events here. We verify signature when
 * STRIPE_WEBHOOK_SECRET is set; otherwise (local dev) we trust the body.
 */
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (webhookSecret && webhookSecret !== 'whsec_xxx_will_get_later') {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Local dev fallback — body is a Buffer because we used express.raw
      const bodyStr = Buffer.isBuffer(req.body) ? req.body.toString() : req.body;
      event = typeof bodyStr === 'string' ? JSON.parse(bodyStr) : bodyStr;
    }
  } catch (err) {
    console.error('[Stripe Webhook] Signature verification failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  console.log('[Stripe Webhook] Event:', event.type);

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const bookingId = intent.metadata && intent.metadata.bookingId;
        if (bookingId) {
          const booking = await Booking.findById(bookingId);
          if (booking) {
            booking.paymentStatus = 'paid';
            booking.paidAt = new Date();
            booking.stripeChargeId = intent.latest_charge || null;
            await booking.save();
            console.log('[Stripe Webhook] Booking marked PAID:', booking.bookingNumber);
          }
        }
        break;
      }
      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const bookingId = intent.metadata && intent.metadata.bookingId;
        if (bookingId) {
          const booking = await Booking.findById(bookingId);
          if (booking) {
            booking.paymentStatus = 'failed';
            await booking.save();
            console.log('[Stripe Webhook] Booking marked FAILED:', booking.bookingNumber);
          }
        }
        break;
      }
      default:
        console.log('[Stripe Webhook] Unhandled event:', event.type);
    }
  } catch (err) {
    console.error('[Stripe Webhook] Handler error:', err);
  }

  res.json({ received: true });
};
