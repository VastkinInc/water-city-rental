import { stripe } from './paymentController.js';

// Stripe Connect Step B — owner/captain onboarding + status.
// This batch only links accounts and reports payout-readiness. It does NOT
// split any payments yet (that is the next batch). The account id is always
// derived from req.user, never from the request body, so a user can only ever
// touch their own Connect account.

const FRONTEND_URL = () => process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * POST /api/connect/onboard
 * Creates a Stripe Connect Express account for the logged-in owner/captain
 * (once), then returns a hosted onboarding URL for the frontend to redirect to.
 */
export const onboard = async (req, res, next) => {
  try {
    const user = req.user;

    // Create the Express account only if the user doesn't already have one.
    if (!user.stripeAccountId) {
      const account = await stripe.accounts.create({ type: 'express' });
      user.stripeAccountId = account.id;
      await user.save();
    }

    const base = FRONTEND_URL();
    const accountLink = await stripe.accountLinks.create({
      account: user.stripeAccountId,
      refresh_url: `${base}/connect/refresh`,
      return_url: `${base}/connect/return`,
      type: 'account_onboarding'
    });

    res.status(200).json({ success: true, url: accountLink.url });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/connect/status
 * Reports whether the logged-in user has a Connect account and whether that
 * account can actually receive payouts. Syncs stripeOnboardingComplete on the
 * user so other code can trust the stored flag.
 */
export const getStatus = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user.stripeAccountId) {
      return res.status(200).json({
        success: true,
        connected: false,
        onboardingComplete: false
      });
    }

    const account = await stripe.accounts.retrieve(user.stripeAccountId);
    const onboardingComplete = Boolean(
      account.charges_enabled &&
      account.payouts_enabled &&
      account.details_submitted
    );

    // Keep the stored flag in sync with Stripe's view of the account.
    if (user.stripeOnboardingComplete !== onboardingComplete) {
      user.stripeOnboardingComplete = onboardingComplete;
      await user.save();
    }

    res.status(200).json({
      success: true,
      connected: true,
      onboardingComplete
    });
  } catch (err) {
    next(err);
  }
};
