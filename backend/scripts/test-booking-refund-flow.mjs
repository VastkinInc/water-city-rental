// ─────────────────────────────────────────────────────────────────────────────
// E2E: booking → payment → refund MATRIX, against a LOCAL backend, Stripe TEST.
//
// Models the existing dev-script pattern (env-driven creds, no hardcoded
// secrets — see scripts/test-inquiries-endpoint.mjs) and the wipe-test-data.mjs
// Mongoose connect/teardown pattern. It DOES NOT blanket-wipe: it tracks every
// _id it creates and deletes ONLY those.
//
// COVERAGE (per case the script: book → [pay: Stripe test PI confirmed w/
// pm_card_visa → webhook] → cancel/decline → re-fetch booking → assert
// status + refundAmount + paymentStatus + stripeRefundId, and verify the
// refund via the Stripe test API):
//   A standard daily  >7d     customer cancel → 100%
//   B standard daily  48h–7d  customer cancel → 50%
//   C standard daily  <48h    customer cancel → 0%   (no Stripe refund)
//   D standard daily          owner decline   → 100%
//   E flexible daily  <48h    customer cancel → 50%  (vs 0% under standard)
//   F flexible daily  48h–7d  customer cancel → 100% (vs 50% under standard)
//   G strict   daily  48h–7d  customer cancel → 0%   (vs 50% under standard)
//   H hourly boat     >7d     customer cancel → 100% (3h booking, hourly pricing)
//   I with-captain    >7d     customer cancel → 100% (captain fee in refund total)
//   J standard daily  48h–7d  customer cancel → UNPAID path (no money, refund 0)
//
// Payment confirm path mirrors production: confirm a real test PaymentIntent
// with pm_card_visa (refundable charge), then fire payment_intent.succeeded.
// The webhook is signature-verified only when STRIPE_WEBHOOK_SECRET is set;
// locally it's empty, so the dev fallback trusts the unsigned body.
//
// SAFETY: aborts immediately unless STRIPE_SECRET_KEY starts with "sk_test_".
//
// Usage (from anywhere — .env is loaded relative to this file):
//   node backend/scripts/test-booking-refund-flow.mjs
// Requires the backend running locally:  cd backend && npm run dev
//   Override target:  API_BASE=http://localhost:5000 node backend/scripts/...
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Stripe from 'stripe';

// Load backend/.env regardless of the current working directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Booking from '../src/models/Booking.js';
import Boat from '../src/models/Boat.js';
import User from '../src/models/User.js';

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const MONGO_URI = process.env.MONGO_URI;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
// A real webhook is "live" only when the backend will actually verify the
// signature — i.e. a usable secret is configured (the backend treats the
// placeholder 'whsec_xxx_will_get_later' as unset).
const SIGNED_WEBHOOK = !!WEBHOOK_SECRET && WEBHOOK_SECRET !== 'whsec_xxx_will_get_later';
const TS = Date.now();
const TAG = `e2e-refund-${TS}`;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const TAX_RATE = 0.0625;        // mirrors backend pricing.js
const DAY_RATE = 1000;          // boat $/day
const HOURLY_RATE = 200;        // boat $/hour
const CAP_DAY = 240;            // captain $/day
const CAP_HOUR = 40;            // captain $/hour

const round2 = (n) => Math.round(Number(n) * 100) / 100;

// Mirror of backend utils/pricing.js — used to predict grandTotal per case.
function calcGrand({ rateType, dayRate = 0, hourlyRate = 0, days = 0, hours = 0, capDay = 0, capHour = 0 }) {
  let boatTotal, captainTotal;
  if (rateType === 'daily') { boatTotal = dayRate * days; captainTotal = capDay * days; }
  else { boatTotal = hourlyRate * hours; captainTotal = capHour * hours; }
  const taxable = boatTotal + captainTotal;
  const tax = round2(taxable * TAX_RATE);
  const base = boatTotal + captainTotal + tax;
  // service-fee gross-up, mirrors backend pricing.js (STRIPE_PCT / STRIPE_FIXED)
  return Math.ceil((base + 0.30) / (1 - 0.029) * 100) / 100;
}

// ── Tiny logging helpers (same spirit as test-inquiries-endpoint.mjs) ────────
function header(s) {
  console.log('\n' + '='.repeat(72));
  console.log(s);
  console.log('='.repeat(72));
}
const log = (...a) => console.log('  ', ...a);
const cents = (d) => Math.round(Number(d) * 100);
const eqMoney = (a, b) => cents(a) === cents(b);

// ── HTTP helper ───────────────────────────────────────────────────────────────
async function api(method, pathName, { token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${pathName}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* leave raw */ }
  return { status: res.status, ok: res.ok, json, text };
}

// ── State tracked for precise teardown ───────────────────────────────────────
const created = { bookingIds: [], boatIds: [], userIds: [] };
const stripe = new Stripe(STRIPE_KEY);

// Post a webhook event the way Stripe would. When a signing secret is set we
// sign the EXACT raw payload with the same algorithm Stripe uses (so the
// backend's stripe.webhooks.constructEvent signature check runs for real);
// otherwise we fall back to the unsigned local-dev path.
async function postWebhook(event) {
  const payload = JSON.stringify(event);
  const headers = { 'Content-Type': 'application/json' };
  if (SIGNED_WEBHOOK) {
    headers['Stripe-Signature'] = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  }
  const res = await fetch(`${API_BASE}/api/payments/webhook`, { method: 'POST', headers, body: payload });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

// ── Guards ────────────────────────────────────────────────────────────────────
function assertTestMode() {
  if (!STRIPE_KEY) {
    console.error('FATAL: STRIPE_SECRET_KEY is not set. Refusing to run.'); process.exit(1);
  }
  if (STRIPE_KEY.startsWith('sk_live_')) {
    console.error('FATAL: STRIPE_SECRET_KEY is a LIVE key (sk_live_). Refusing to run against live Stripe.'); process.exit(1);
  }
  if (!STRIPE_KEY.startsWith('sk_test_')) {
    console.error(`FATAL: STRIPE_SECRET_KEY is not a test key (expected sk_test_, got "${STRIPE_KEY.slice(0, 8)}…"). Refusing to run.`); process.exit(1);
  }
  if (!MONGO_URI) { console.error('FATAL: MONGO_URI is not set.'); process.exit(1); }
}

async function assertBackendUp() {
  let h;
  try { h = await api('GET', '/api/health'); }
  catch (err) {
    console.error(`FATAL: cannot reach backend at ${API_BASE} — is it running? (cd backend && npm run dev)`);
    console.error('       ', err.message); process.exit(1);
  }
  if (!h.ok || !h.json || h.json.status !== 'ok') {
    console.error(`FATAL: backend health check failed at ${API_BASE}:`, h.text); process.exit(1);
  }
  log(`Backend OK at ${API_BASE} (db=${h.json.db}, env=${h.json.environment})`);
}

// ── Setup: owner + captain (Mongo, both Connect-ready), customer (API) ───────
async function setupFixtures() {
  header('SETUP — fixtures');

  const owner = await User.create({
    name: 'E2E Refund Owner',
    email: `${TAG}-owner@test.local`,
    password: 'Test1234',
    phone: '5550000001',
    role: 'owner',
    isActive: true,
    // Satisfies the create-intent P2 guard. No real Connect onboarding needed:
    // the intent uses no transfer_data, so this flag is purely the app's gate.
    stripeAccountId: 'acct_e2e_owner_placeholder',
    stripeOnboardingComplete: true
  });
  created.userIds.push(owner._id);
  log(`owner    ${owner.email}  (${owner._id})`);

  const captain = await User.create({
    name: 'E2E Refund Captain',
    email: `${TAG}-captain@test.local`,
    password: 'Test1234',
    phone: '5550000003',
    role: 'captain',
    isActive: true,
    captainProfile: { dayRate: CAP_DAY, hourlyRate: CAP_HOUR, yearsExperience: 5 },
    stripeAccountId: 'acct_e2e_captain_placeholder',
    stripeOnboardingComplete: true
  });
  created.userIds.push(captain._id);
  log(`captain  ${captain.email}  (${captain._id})  $${CAP_DAY}/day`);

  const reg = await api('POST', '/api/auth/register', {
    body: { name: 'E2E Refund Customer', email: `${TAG}-customer@test.local`, password: 'Test1234', phone: '5550000002', role: 'customer' }
  });
  if (!reg.ok || !reg.json?.accessToken) throw new Error(`Customer register failed (${reg.status}): ${reg.text}`);
  if (reg.json.user?.id) created.userIds.push(reg.json.user.id);
  const customerToken = reg.json.accessToken;
  log(`customer ${TAG}-customer@test.local  (${reg.json.user?.id})`);

  const ownerLogin = await api('POST', '/api/auth/login', { body: { email: `${TAG}-owner@test.local`, password: 'Test1234' } });
  if (!ownerLogin.ok || !ownerLogin.json?.accessToken) throw new Error(`Owner login failed (${ownerLogin.status}): ${ownerLogin.text}`);
  log('owner + customer tokens acquired');

  return { owner, captain, customerToken, ownerToken: ownerLogin.json.accessToken };
}

// ── Per-case boat (so policy/rateType vary and dates never conflict) ─────────
async function createBoat({ ownerId, policy, rateType }) {
  const boat = await Boat.create({
    name: `E2E ${policy}/${rateType} ${TS}-${created.boatIds.length}`,
    type: 'Powerboat',
    maxGuests: 12,
    harbor: 'Monroe Harbor',
    city: 'Chicago',
    rateType,
    ...(rateType === 'daily' ? { dayRate: DAY_RATE } : { hourlyRate: HOURLY_RATE }),
    owner: ownerId,
    status: 'active',
    cancellationPolicy: policy
  });
  created.boatIds.push(boat._id);
  return boat;
}

// ── Create a booking, optionally drive it to PAID ────────────────────────────
async function createBooking({ boatId, captainId, customerToken, startDate, endDate, expectedGrand, pay }) {
  const create = await api('POST', '/api/bookings', {
    token: customerToken,
    body: {
      boatId: String(boatId),
      ...(captainId ? { captainId: String(captainId) } : {}),
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      numGuests: 4
    }
  });
  if (create.status !== 201) throw new Error(`create booking failed (${create.status}): ${create.text}`);
  const booking = create.json.data;
  const bookingId = booking._id || booking.id;
  created.bookingIds.push(bookingId);

  if (!eqMoney(booking.pricing?.grandTotal, expectedGrand)) {
    throw new Error(`unexpected grandTotal: got ${booking.pricing?.grandTotal}, expected ${expectedGrand}`);
  }

  if (!pay) return { bookingId, piId: null };

  const intent = await api('POST', '/api/payments/create-intent', { token: customerToken, body: { bookingId: String(bookingId) } });
  if (!intent.ok || !intent.json?.data?.clientSecret) throw new Error(`create-intent failed (${intent.status}): ${intent.text}`);
  const piId = intent.json.data.clientSecret.split('_secret_')[0];

  const confirmed = await stripe.paymentIntents.confirm(piId, { payment_method: 'pm_card_visa', return_url: 'https://example.com/return' });
  if (confirmed.status !== 'succeeded') throw new Error(`PaymentIntent did not succeed (status=${confirmed.status})`);

  const hook = await postWebhook({
    type: 'payment_intent.succeeded',
    data: { object: { id: piId, latest_charge: confirmed.latest_charge, metadata: { bookingId: String(bookingId) } } }
  });
  if (!hook.ok) throw new Error(`webhook post failed (${hook.status}): ${hook.text}`);

  const after = await api('GET', `/api/bookings/${bookingId}`, { token: customerToken });
  if (!after.ok || after.json.data.paymentStatus !== 'paid') {
    throw new Error(`expected paymentStatus 'paid', got '${after.json?.data?.paymentStatus}'`);
  }
  return { bookingId, piId };
}

// ── Assert the post-trigger contract ─────────────────────────────────────────
async function assertOutcome({ bookingId, piId, token, expect }) {
  const res = await api('GET', `/api/bookings/${bookingId}`, { token });
  if (!res.ok) throw new Error(`fetch booking failed (${res.status}): ${res.text}`);
  const b = res.json.data;

  const problems = [];
  if (b.status !== 'cancelled') problems.push(`status: expected 'cancelled', got '${b.status}'`);
  if (!eqMoney(b.refundAmount, expect.refundAmount)) {
    problems.push(`refundAmount: expected $${expect.refundAmount.toFixed(2)}, got $${Number(b.refundAmount).toFixed(2)}`);
  }
  if (b.paymentStatus !== expect.paymentStatus) {
    problems.push(`paymentStatus: expected '${expect.paymentStatus}', got '${b.paymentStatus}'`);
  }

  if (expect.stripeRefund) {
    if (!b.stripeRefundId || !String(b.stripeRefundId).startsWith('re_')) {
      problems.push(`stripeRefundId: expected a 're_…' id, got '${b.stripeRefundId}'`);
    } else {
      try {
        const r = await stripe.refunds.retrieve(b.stripeRefundId);
        if (!eqMoney(expect.refundAmount, r.amount / 100)) problems.push(`Stripe refund amount: expected ${cents(expect.refundAmount)}¢, got ${r.amount}¢`);
        if (piId && r.payment_intent !== piId) problems.push(`Stripe refund payment_intent: expected ${piId}, got ${r.payment_intent}`);
        if (!['succeeded', 'pending'].includes(r.status)) problems.push(`Stripe refund status: '${r.status}'`);
        log(`Stripe refund verified: ${r.id} amount=${r.amount}¢ status=${r.status}`);
      } catch (err) { problems.push(`Stripe refund retrieve failed: ${err.message}`); }
    }
  } else if (b.stripeRefundId) {
    problems.push(`stripeRefundId: expected none, got '${b.stripeRefundId}'`);
  }

  return { problems, observed: { status: b.status, refundAmount: b.refundAmount, paymentStatus: b.paymentStatus, stripeRefundId: b.stripeRefundId } };
}

// ── Case runner ──────────────────────────────────────────────────────────────
async function runCase(ctx, def) {
  header(`CASE ${def.id} — ${def.name}`);

  const boat = await createBoat({ ownerId: ctx.owner._id, policy: def.policy, rateType: def.rateType });
  const startDate = new Date(Date.now() + def.startOffsetMs);
  const endDate = def.rateType === 'daily'
    ? new Date(startDate.getTime() + DAY)               // 1 calendar day → days=1
    : new Date(startDate.getTime() + def.hours * HOUR); // hourly

  const expectedGrand = calcGrand({
    rateType: def.rateType, dayRate: DAY_RATE, hourlyRate: HOURLY_RATE,
    days: def.rateType === 'daily' ? 1 : 0, hours: def.rateType === 'hourly' ? def.hours : 0,
    capDay: def.captain ? CAP_DAY : 0, capHour: def.captain ? CAP_HOUR : 0
  });
  const refundAmount = def.pay ? round2(expectedGrand * def.expectPct / 100) : 0;
  const paymentStatus = !def.pay ? 'unpaid'
    : def.expectPct === 100 ? 'refunded'
    : def.expectPct > 0 ? 'partially_refunded' : 'paid';
  const stripeRefund = def.pay && def.expectPct > 0;

  log(`policy=${def.policy} rate=${def.rateType} captain=${!!def.captain} paid=${def.pay} grand=$${expectedGrand.toFixed(2)} expect ${def.expectPct}% = $${refundAmount.toFixed(2)}`);

  const { bookingId, piId } = await createBooking({
    boatId: boat._id, captainId: def.captain ? ctx.captain._id : null,
    customerToken: ctx.customerToken, startDate, endDate, expectedGrand, pay: def.pay
  });
  log(`booking ${bookingId} ${def.pay ? `PAID (PI ${piId})` : 'created UNPAID'}`);

  const ep = def.trigger === 'owner-decline' ? 'decline' : 'cancel';
  const token = def.trigger === 'owner-decline' ? ctx.ownerToken : ctx.customerToken;
  const trig = await api('PATCH', `/api/bookings/${bookingId}/${ep}`, { token, body: { cancellationReason: `e2e ${def.id}` } });
  if (!trig.ok) throw new Error(`${def.trigger} failed (${trig.status}): ${trig.text}`);
  log(`triggered ${def.trigger} → HTTP ${trig.status}`);

  const { problems, observed } = await assertOutcome({ bookingId, piId, token: ctx.customerToken, expect: { refundAmount, paymentStatus, stripeRefund } });
  log('observed:', JSON.stringify(observed));
  const pass = problems.length === 0;
  if (!pass) problems.forEach((p) => log('   ✗', p));
  return { id: def.id, name: def.name, pass, problems };
}

// ── Teardown: delete ONLY what this run created ──────────────────────────────
async function teardown() {
  header('TEARDOWN — deleting only this run’s data');
  try {
    if (created.bookingIds.length) { const r = await Booking.deleteMany({ _id: { $in: created.bookingIds } }); log(`bookings deleted: ${r.deletedCount}/${created.bookingIds.length}`); }
    if (created.boatIds.length) { const r = await Boat.deleteMany({ _id: { $in: created.boatIds } }); log(`boats deleted:    ${r.deletedCount}/${created.boatIds.length}`); }
    if (created.userIds.length) { const r = await User.deleteMany({ _id: { $in: created.userIds } }); log(`users deleted:    ${r.deletedCount}/${created.userIds.length}`); }
    const strayBoats = await Boat.countDocuments({ name: new RegExp(`${TS}`) });
    const strayUsers = await User.countDocuments({ email: new RegExp(`^${TAG}-`) });
    log(`stray after cleanup → boats=${strayBoats} users=${strayUsers}`);
  } catch (err) { console.error('  Teardown error (manual cleanup may be needed):', err.message); }
}

// ── Matrix ────────────────────────────────────────────────────────────────────
const CASES = [
  { id: 'A', name: 'standard daily >7d — customer cancel → 100%',   policy: 'standard', rateType: 'daily',  startOffsetMs: 10 * DAY, trigger: 'customer-cancel', pay: true,  expectPct: 100 },
  { id: 'B', name: 'standard daily 48h–7d — customer cancel → 50%', policy: 'standard', rateType: 'daily',  startOffsetMs: 4 * DAY,  trigger: 'customer-cancel', pay: true,  expectPct: 50 },
  { id: 'C', name: 'standard daily <48h — customer cancel → 0%',    policy: 'standard', rateType: 'daily',  startOffsetMs: 30 * HOUR, trigger: 'customer-cancel', pay: true, expectPct: 0 },
  { id: 'D', name: 'standard daily — owner decline → 100%',         policy: 'standard', rateType: 'daily',  startOffsetMs: 12 * DAY, trigger: 'owner-decline',   pay: true,  expectPct: 100 },
  { id: 'E', name: 'flexible daily <48h — customer cancel → 50%',   policy: 'flexible', rateType: 'daily',  startOffsetMs: 30 * HOUR, trigger: 'customer-cancel', pay: true, expectPct: 50 },
  { id: 'F', name: 'flexible daily 48h–7d — customer cancel → 100%',policy: 'flexible', rateType: 'daily',  startOffsetMs: 4 * DAY,  trigger: 'customer-cancel', pay: true,  expectPct: 100 },
  { id: 'G', name: 'strict daily 48h–7d — customer cancel → 0%',    policy: 'strict',   rateType: 'daily',  startOffsetMs: 4 * DAY,  trigger: 'customer-cancel', pay: true,  expectPct: 0 },
  { id: 'H', name: 'hourly boat >7d — customer cancel → 100%',      policy: 'standard', rateType: 'hourly', startOffsetMs: 10 * DAY, hours: 3, trigger: 'customer-cancel', pay: true, expectPct: 100 },
  { id: 'I', name: 'with-captain daily >7d — customer cancel → 100%', policy: 'standard', rateType: 'daily', startOffsetMs: 10 * DAY, captain: true, trigger: 'customer-cancel', pay: true, expectPct: 100 },
  { id: 'J', name: 'standard daily 48h–7d — UNPAID cancel (no money)', policy: 'standard', rateType: 'daily', startOffsetMs: 4 * DAY, trigger: 'customer-cancel', pay: false, expectPct: 0 }
];

(async () => {
  header('Water City Rental — booking → payment → refund MATRIX (Stripe TEST)');
  log(`API_BASE = ${API_BASE}`);
  log(`Stripe   = ${STRIPE_KEY.slice(0, 8)}… (TEST)`);
  log(`Webhook  = ${SIGNED_WEBHOOK ? 'SIGNED (real signature verified by backend)' : 'unsigned local-dev fallback (STRIPE_WEBHOOK_SECRET unset)'}`);

  assertTestMode();
  await assertBackendUp();
  await mongoose.connect(MONGO_URI);
  log(`Mongo connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  const results = [];
  try {
    const ctx = await setupFixtures();
    for (const def of CASES) {
      try { results.push(await runCase(ctx, def)); }
      catch (err) { results.push({ id: def.id, name: def.name, pass: false, problems: [err.message] }); console.error(`  CASE ${def.id} threw:`, err.message); }
    }
  } finally {
    await teardown();
    await mongoose.disconnect();
  }

  header('SUMMARY');
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.id}  ${r.name}`);
    if (!r.pass) r.problems.forEach((p) => console.log(`         - ${p}`));
  }
  console.log(`\n  ${results.length - failed}/${results.length} cases passed.`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nFATAL:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
