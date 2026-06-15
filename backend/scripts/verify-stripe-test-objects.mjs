// ─────────────────────────────────────────────────────────────────────────────
// READ-ONLY Stripe verifier — independent confirmation of the money path,
// straight from the Stripe TEST account (no DB, no writes, no app logic).
//
// Prints: which account + mode the key maps to, then recent PaymentIntents with
// their charges and refunds. Use it to eyeball Stripe state after running
// test-booking-refund-flow.mjs, or pass specific ids to verify them by hand.
//
// SAFETY: refuses to run unless STRIPE_SECRET_KEY starts with "sk_test_".
//         It only ever READS (list/retrieve) — it can't move money.
//
// Usage (from anywhere — .env is loaded relative to this file):
//   node backend/scripts/verify-stripe-test-objects.mjs            # recent 10 PIs
//   node backend/scripts/verify-stripe-test-objects.mjs 25         # recent 25 PIs
//   node backend/scripts/verify-stripe-test-objects.mjs pi_123 re_456   # specific ids
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const KEY = process.env.STRIPE_SECRET_KEY || '';
if (!KEY) { console.error('FATAL: STRIPE_SECRET_KEY is not set.'); process.exit(1); }
if (KEY.startsWith('sk_live_')) { console.error('FATAL: live key (sk_live_). This read-only verifier refuses to touch live.'); process.exit(1); }
if (!KEY.startsWith('sk_test_')) { console.error(`FATAL: not a test key (got "${KEY.slice(0, 8)}…").`); process.exit(1); }

const stripe = new Stripe(KEY);
const fmt = (c) => `$${(c / 100).toFixed(2)}`;

async function showPI(pi) {
  const refunds = await stripe.refunds.list({ payment_intent: pi.id, limit: 10 });
  const ch = typeof pi.latest_charge === 'object' && pi.latest_charge ? pi.latest_charge : null;
  const chId = ch ? ch.id : (pi.latest_charge || '-');
  console.log(`PI ${pi.id}  ${pi.status.padEnd(9)} ${fmt(pi.amount).padStart(10)}  livemode=${pi.livemode}`);
  console.log(`   charge=${chId}  amount_refunded=${ch ? fmt(ch.amount_refunded) : 'n/a'}  refunds=${refunds.data.length}`);
  for (const r of refunds.data) {
    console.log(`   ↳ refund ${r.id}  ${fmt(r.amount)}  status=${r.status}  reason=${r.reason || '-'}`);
  }
}

(async () => {
  const acct = await stripe.accounts.retrieve();
  const name = acct.settings?.dashboard?.display_name || acct.business_profile?.name || 'n/a';
  console.log('='.repeat(72));
  console.log(`Stripe account: ${acct.id}  (${name})  — TEST mode`);
  console.log('='.repeat(72));

  const args = process.argv.slice(2);
  const ids = args.filter((a) => a.startsWith('pi_') || a.startsWith('re_'));
  const limitArg = args.find((a) => /^\d+$/.test(a));

  if (ids.length) {
    for (const id of ids) {
      if (id.startsWith('pi_')) {
        const pi = await stripe.paymentIntents.retrieve(id, { expand: ['latest_charge'] });
        await showPI(pi);
      } else {
        const r = await stripe.refunds.retrieve(id);
        console.log(`refund ${r.id}  ${fmt(r.amount)}  status=${r.status}  payment_intent=${r.payment_intent}  livemode=${r.livemode}`);
      }
    }
  } else {
    const limit = limitArg ? Number(limitArg) : 10;
    const pis = await stripe.paymentIntents.list({ limit, expand: ['data.latest_charge'] });
    if (!pis.data.length) { console.log('(no PaymentIntents in this test account)'); }
    for (const pi of pis.data) await showPI(pi);
  }
})().catch((err) => { console.error('FATAL:', err.message); process.exit(1); });
