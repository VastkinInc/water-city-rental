// ─────────────────────────────────────────────────────────────────────────────
// E2E FULL SUITE — auth · booking lifecycle · payments · messages · inquiries ·
// notifications. Runs against a LOCAL backend, Stripe TEST mode.
//
// This is the broad "does every flow work" companion to
// test-booking-refund-flow.mjs (which is the deep refund/cancellation MATRIX).
// Run BOTH for full coverage:
//   node backend/scripts/test-booking-refund-flow.mjs   # refund tiers
//   node backend/scripts/test-e2e-full-suite.mjs        # everything else
//
// Same proven conventions as the refund script:
//   • env-driven creds (no hardcoded secrets) — loads backend/.env
//   • SAFETY: aborts unless STRIPE_SECRET_KEY starts with "sk_test_"
//   • does NOT blanket-wipe — tracks every _id it creates and deletes ONLY those
//   • payment path mirrors production: confirm a real test PaymentIntent with
//     pm_card_visa, then fire payment_intent.succeeded at the webhook.
//
// COVERAGE (each numbered check passes/fails independently):
//   AUTH       register, login, /me, bad password, duplicate email
//   BOOKING    full happy path: create → pay → owner approve → captain accept →
//              confirmed → complete; unpaid-approve guard; captain-decline →
//              needs_new_captain → reassign; owner-decline (paid → 100% refund)
//   PAYMENTS   create-intent returns clientSecret; webhook → paid; double-pay
//              rejected; Connect guard blocks intent for un-onboarded owner
//   MESSAGES   send on a paid trip; thread surfaces to owner; unread count;
//              mark-read clears it; empty rejected; non-participant 403
//   INQUIRIES  create (owner + captain partner); send; list; unread; mark-read;
//              owner-cannot-start (403); empty body rejected
//   NOTIFS     list / unread-count / mark-one-read / read-all / can't-read-others
//              (endpoints are seeded directly — in-app emit isn't wired yet)
//
// Usage (backend must be running:  cd backend && npm run dev):
//   node backend/scripts/test-e2e-full-suite.mjs
//   API_BASE=http://localhost:5000 node backend/scripts/test-e2e-full-suite.mjs
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Booking from '../src/models/Booking.js';
import Boat from '../src/models/Boat.js';
import User from '../src/models/User.js';
import Message from '../src/models/Message.js';
import Conversation from '../src/models/Conversation.js';
import ConversationMessage from '../src/models/ConversationMessage.js';
import Notification from '../src/models/Notification.js';

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE || 'http://localhost:5000';
const MONGO_URI = process.env.MONGO_URI;
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const SIGNED_WEBHOOK = !!WEBHOOK_SECRET && WEBHOOK_SECRET !== 'whsec_xxx_will_get_later';
const TS = Date.now();
const TAG = `e2e-full-${TS}`;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DAY_RATE = 1000;   // boat $/day
const CAP_DAY = 240;     // captain $/day

const stripe = new Stripe(STRIPE_KEY);

// ── Logging ────────────────────────────────────────────────────────────────────
function header(s) {
  console.log('\n' + '='.repeat(72));
  console.log(s);
  console.log('='.repeat(72));
}
const log = (...a) => console.log('  ', ...a);

// ── Result tracking: every check records pass/fail with a label ──────────────
const results = [];
let currentSection = '';
function section(name) { currentSection = name; header(name); }

/** Assert truthy. Records a result row; never throws (so one failure doesn't
 *  abort the rest of the suite). Returns the boolean so callers can branch. */
function check(label, cond, detail) {
  const pass = !!cond;
  results.push({ section: currentSection, label, pass, detail: pass ? '' : (detail || '') });
  log(`${pass ? '✓' : '✗ FAIL'}  ${label}${pass ? '' : `  — ${detail || ''}`}`);
  return pass;
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
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

// ── State tracked for precise teardown ───────────────────────────────────────
const created = {
  bookingIds: [], boatIds: [], userIds: [], conversationIds: [], notificationIds: []
};

// ── Guards ────────────────────────────────────────────────────────────────────
function assertTestMode() {
  if (!STRIPE_KEY) { console.error('FATAL: STRIPE_SECRET_KEY is not set. Refusing to run.'); process.exit(1); }
  if (STRIPE_KEY.startsWith('sk_live_')) { console.error('FATAL: STRIPE_SECRET_KEY is a LIVE key (sk_live_). Refusing to run against live Stripe.'); process.exit(1); }
  if (!STRIPE_KEY.startsWith('sk_test_')) { console.error(`FATAL: STRIPE_SECRET_KEY is not a test key (got "${STRIPE_KEY.slice(0, 8)}…"). Refusing to run.`); process.exit(1); }
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

// ── Connect-ready user (owner/captain) created straight in Mongo ─────────────
// The create-intent guard only checks the stripeOnboardingComplete flag; the
// PaymentIntent itself uses no transfer_data, so a placeholder acct is fine.
async function makeConnectUser({ name, role, email, captainProfile, onboarded = true }) {
  const u = await User.create({
    name, email, password: 'Test1234', role, isActive: true,
    ...(captainProfile ? { captainProfile } : {}),
    stripeAccountId: onboarded ? `acct_${TAG}_${role}_placeholder` : null,
    stripeOnboardingComplete: onboarded
  });
  created.userIds.push(u._id);
  return u;
}

async function registerCustomer(suffix) {
  const email = `${TAG}-customer${suffix}@test.local`;
  const reg = await api('POST', '/api/auth/register', {
    body: { name: `E2E Customer ${suffix}`, email, password: 'Test1234', phone: '5550000000', role: 'customer' }
  });
  if (!reg.ok || !reg.json?.accessToken) throw new Error(`Customer register failed (${reg.status}): ${reg.text}`);
  if (reg.json.user?.id) created.userIds.push(reg.json.user.id);
  return { email, token: reg.json.accessToken, id: reg.json.user?.id };
}

async function loginToken(email) {
  const r = await api('POST', '/api/auth/login', { body: { email, password: 'Test1234' } });
  if (!r.ok || !r.json?.accessToken) throw new Error(`Login failed for ${email} (${r.status}): ${r.text}`);
  return r.json.accessToken;
}

async function createBoat({ ownerId, recommendedCaptainId, name }) {
  const boat = await Boat.create({
    name: name || `E2E Boat ${TS}-${created.boatIds.length}`,
    type: 'Powerboat',
    maxGuests: 12,
    harbor: 'Monroe Harbor',
    city: 'Chicago',
    rateType: 'daily',
    dayRate: DAY_RATE,
    owner: ownerId,
    ...(recommendedCaptainId ? { recommendedCaptain: recommendedCaptainId } : {}),
    status: 'active',
    cancellationPolicy: 'standard'
  });
  created.boatIds.push(boat._id);
  return boat;
}

// Create a booking via the API; optionally drive it all the way to PAID using a
// real Stripe test PaymentIntent + the success webhook (production-faithful).
async function bookAndMaybePay({ boatId, captainId, customerToken, startOffsetMs = 10 * DAY, pay = false }) {
  const startDate = new Date(Date.now() + startOffsetMs);
  const endDate = new Date(startDate.getTime() + DAY);
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
  if (!pay) return { bookingId, piId: null, booking };

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
  return { bookingId, piId, booking };
}

const getBooking = async (id, token) => (await api('GET', `/api/bookings/${id}`, { token })).json?.data;

// ══════════════════════════════════════════════════════════════════════════════
// SUITES
// ══════════════════════════════════════════════════════════════════════════════

async function suiteAuth(ctx) {
  section('AUTH');
  check('register customer issues access token + customer role',
    !!ctx.customer.token, 'no token from register');

  // /me returns the user under `user` (not `data`, unlike the other endpoints).
  const me = await api('GET', '/api/auth/me', { token: ctx.customer.token });
  check('GET /me returns the authenticated customer',
    me.ok && me.json?.user?.role === 'customer', `${me.status} ${me.text}`);

  const ownerTok = await api('POST', '/api/auth/login', { body: { email: ctx.owner.email, password: 'Test1234' } });
  check('login owner with correct password → token', ownerTok.ok && !!ownerTok.json?.accessToken, `${ownerTok.status} ${ownerTok.text}`);

  const bad = await api('POST', '/api/auth/login', { body: { email: ctx.owner.email, password: 'WrongPass999' } });
  check('login with wrong password → 401', bad.status === 401, `got ${bad.status}`);

  const dup = await api('POST', '/api/auth/register', {
    body: { name: 'Dup', email: ctx.customer.email, password: 'Test1234', role: 'customer' }
  });
  check('register with an existing email → rejected (4xx)', dup.status >= 400 && dup.status < 500, `got ${dup.status}`);
}

async function suiteBookingHappyPath(ctx) {
  section('BOOKING — full happy path (create → pay → approve → accept → complete)');
  const boat = await createBoat({ ownerId: ctx.owner._id, recommendedCaptainId: ctx.captain._id });

  // create (unpaid)
  const { bookingId } = await bookAndMaybePay({ boatId: boat._id, captainId: ctx.captain._id, customerToken: ctx.customer.token, pay: false });
  let b = await getBooking(bookingId, ctx.customer.token);
  check('booking created as pending / unpaid', b?.status === 'pending' && b?.paymentStatus === 'unpaid', `status=${b?.status} pay=${b?.paymentStatus}`);

  // guard: cannot approve before payment
  const earlyApprove = await api('PATCH', `/api/bookings/${bookingId}/approve`, { token: ctx.ownerToken });
  check('owner cannot approve an UNPAID booking → 400', earlyApprove.status === 400, `got ${earlyApprove.status}`);

  // pay it (separate paid booking to keep the flow linear & faithful)
  const paid = await bookAndMaybePay({ boatId: boat._id, captainId: ctx.captain._id, customerToken: ctx.customer.token, pay: true });
  b = await getBooking(paid.bookingId, ctx.customer.token);
  check('after pay → paymentStatus paid, payout held', b?.paymentStatus === 'paid' && b?.payoutStatus === 'held', `pay=${b?.paymentStatus} payout=${b?.payoutStatus}`);

  // owner approves
  const ap = await api('PATCH', `/api/bookings/${paid.bookingId}/approve`, { token: ctx.ownerToken });
  b = ap.json?.data;
  check('owner approve → ownerApproved, still pending (captain pending)', ap.ok && b?.ownerApproved === true && b?.status === 'pending', `${ap.status} status=${b?.status}`);

  // captain accepts → auto-confirm
  const acc = await api('PATCH', `/api/bookings/${paid.bookingId}/captain-accept`, { token: ctx.captainToken });
  b = acc.json?.data;
  check('captain accept → both approved → status confirmed', acc.ok && b?.status === 'confirmed', `${acc.status} status=${b?.status}`);

  // complete (captain)
  const comp = await api('PATCH', `/api/bookings/${paid.bookingId}/complete`, { token: ctx.captainToken });
  b = comp.json?.data;
  check('captain complete → status completed', comp.ok && b?.status === 'completed', `${comp.status} status=${b?.status}`);

  // stash the confirmed (pre-complete) booking id for messaging tests — reuse the
  // completed one (completed is still an active-paid-trip state for chat).
  ctx.paidConfirmedBookingId = paid.bookingId;
}

async function suiteBookingCaptainReassign(ctx) {
  section('BOOKING — captain decline → needs_new_captain → reassign');
  const boat = await createBoat({ ownerId: ctx.owner._id, recommendedCaptainId: ctx.captain._id });
  const { bookingId } = await bookAndMaybePay({ boatId: boat._id, captainId: ctx.captain._id, customerToken: ctx.customer.token, pay: true });

  const dec = await api('PATCH', `/api/bookings/${bookingId}/captain-decline`, { token: ctx.captainToken });
  let b = dec.json?.data || await getBooking(bookingId, ctx.customer.token);
  check('captain decline (paid) → status needs_new_captain', dec.ok && b?.status === 'needs_new_captain', `${dec.status} status=${b?.status}`);

  const re = await api('PATCH', `/api/bookings/${bookingId}/reassign-captain`, { token: ctx.ownerToken, body: { captainId: String(ctx.captain2._id) } });
  b = re.json?.data;
  check('owner reassign to a different captain → back to pending', re.ok && b?.status === 'pending' && String(b?.captain?._id || b?.captain) === String(ctx.captain2._id), `${re.status} status=${b?.status}`);
}

async function suiteBookingOwnerDecline(ctx) {
  section('BOOKING — owner decline of a PAID booking → 100% refund');
  const boat = await createBoat({ ownerId: ctx.owner._id, recommendedCaptainId: ctx.captain._id });
  const { bookingId } = await bookAndMaybePay({ boatId: boat._id, captainId: ctx.captain._id, customerToken: ctx.customer.token, pay: true });
  const grand = (await getBooking(bookingId, ctx.customer.token))?.pricing?.grandTotal;

  const dec = await api('PATCH', `/api/bookings/${bookingId}/decline`, { token: ctx.ownerToken, body: { cancellationReason: 'e2e owner decline' } });
  const b = await getBooking(bookingId, ctx.customer.token);
  check('owner decline → status cancelled + paymentStatus refunded', dec.ok && b?.status === 'cancelled' && b?.paymentStatus === 'refunded', `${dec.status} status=${b?.status} pay=${b?.paymentStatus}`);
  check('owner decline → full refund (refundAmount == grandTotal) + Stripe re_ id',
    Math.round((b?.refundAmount || 0) * 100) === Math.round((grand || 0) * 100) && String(b?.stripeRefundId || '').startsWith('re_'),
    `refund=${b?.refundAmount} grand=${grand} re=${b?.stripeRefundId}`);
}

async function suitePayments(ctx) {
  section('PAYMENTS — intent, double-pay guard, Connect guard');
  const boat = await createBoat({ ownerId: ctx.owner._id, recommendedCaptainId: ctx.captain._id });
  const { bookingId } = await bookAndMaybePay({ boatId: boat._id, captainId: ctx.captain._id, customerToken: ctx.customer.token, pay: true });

  // already-paid booking → create-intent should refuse
  const again = await api('POST', '/api/payments/create-intent', { token: ctx.customer.token, body: { bookingId: String(bookingId) } });
  check('create-intent on an already-PAID booking → rejected', again.status >= 400, `got ${again.status}`);

  // Connect guard: owner not onboarded → create-intent blocked (409)
  const badOwner = await makeConnectUser({ name: 'No-Connect Owner', role: 'owner', email: `${TAG}-noconnect-owner@test.local`, onboarded: false });
  const badBoat = await createBoat({ ownerId: badOwner._id, name: `E2E NoConnect ${TS}` });
  const noCapBooking = await bookAndMaybePay({ boatId: badBoat._id, customerToken: ctx.customer.token, pay: false });
  const guard = await api('POST', '/api/payments/create-intent', { token: ctx.customer.token, body: { bookingId: String(noCapBooking.bookingId) } });
  check('create-intent blocked when owner is not Connect-onboarded (409)', guard.status === 409, `got ${guard.status}: ${guard.text?.slice(0, 120)}`);
}

async function suiteMessages(ctx) {
  section('MESSAGES — booking-thread chat on a paid trip');
  const bookingId = ctx.paidConfirmedBookingId;
  if (!bookingId) { check('messages: prerequisite paid booking exists', false, 'no paid booking from happy-path suite'); return; }

  const send = await api('POST', '/api/messages', { token: ctx.customer.token, body: { bookingId: String(bookingId), content: 'Hi, what time should we arrive at the harbor?' } });
  check('customer sends a message on a paid trip → 201', send.status === 201, `${send.status} ${send.text}`);

  const empty = await api('POST', '/api/messages', { token: ctx.customer.token, body: { bookingId: String(bookingId), content: '   ' } });
  check('empty message rejected → 400', empty.status === 400, `got ${empty.status}`);

  const outsider = await api('POST', '/api/messages', { token: ctx.outsider.token, body: { bookingId: String(bookingId), content: 'I should not be able to post here' } });
  check('non-participant cannot post → 403', outsider.status === 403, `got ${outsider.status}`);

  const convs = await api('GET', '/api/messages/conversations', { token: ctx.ownerToken });
  const surfaced = (convs.json?.data || []).some((c) => String(c.bookingId) === String(bookingId));
  check('paid trip surfaces as a conversation for the owner', convs.ok && surfaced, `${convs.status} count=${convs.json?.data?.length}`);

  const unread1 = await api('GET', '/api/messages/unread-count', { token: ctx.ownerToken });
  check('owner has ≥1 unread message', (unread1.json?.data?.count || 0) >= 1, `count=${unread1.json?.data?.count}`);

  const read = await api('PATCH', `/api/messages/conversations/${bookingId}/read`, { token: ctx.ownerToken });
  const unread2 = await api('GET', '/api/messages/unread-count', { token: ctx.ownerToken });
  check('after owner marks thread read → unread count 0', read.ok && (unread2.json?.data?.count || 0) === 0, `read=${read.status} count=${unread2.json?.data?.count}`);
}

async function suiteInquiries(ctx) {
  section('INQUIRIES — pre-booking conversations (owner + captain)');
  const boat = await createBoat({ ownerId: ctx.owner._id, recommendedCaptainId: ctx.captain._id, name: `E2E Inquiry Boat ${TS}` });

  const ownerConv = await api('POST', '/api/conversations', { token: ctx.customer.token, body: { boatId: String(boat._id), partnerRole: 'owner' } });
  const convId = ownerConv.json?.data?._id;
  if (convId) created.conversationIds.push(convId);
  check('customer starts an inquiry to the owner → 201', ownerConv.status === 201 && !!convId, `${ownerConv.status} ${ownerConv.text}`);

  const capConv = await api('POST', '/api/conversations', { token: ctx.customer.token, body: { boatId: String(boat._id), partnerRole: 'captain' } });
  if (capConv.json?.data?._id) created.conversationIds.push(capConv.json.data._id);
  check('customer starts an inquiry to the recommended captain → 201', capConv.status === 201, `${capConv.status} ${capConv.text}`);

  const ownerCantStart = await api('POST', '/api/conversations', { token: ctx.ownerToken, body: { boatId: String(boat._id), partnerRole: 'owner' } });
  check('non-customer cannot start an inquiry → 403', ownerCantStart.status === 403, `got ${ownerCantStart.status}`);

  const msg = await api('POST', `/api/conversations/${convId}/messages`, { token: ctx.customer.token, body: { body: 'Is this boat available next weekend?' } });
  check('send inquiry message → 201', msg.status === 201, `${msg.status} ${msg.text}`);

  const emptyMsg = await api('POST', `/api/conversations/${convId}/messages`, { token: ctx.customer.token, body: { body: '   ' } });
  check('empty inquiry message rejected → 400', emptyMsg.status === 400, `got ${emptyMsg.status}`);

  const mine = await api('GET', '/api/conversations', { token: ctx.customer.token });
  check('customer lists ≥2 inquiry threads', mine.ok && (mine.json?.data?.length || 0) >= 2, `${mine.status} count=${mine.json?.data?.length}`);

  const ownerUnread1 = await api('GET', '/api/conversations/unread-count', { token: ctx.ownerToken });
  check('owner sees ≥1 unread inquiry message', (ownerUnread1.json?.data?.count || 0) >= 1, `count=${ownerUnread1.json?.data?.count}`);

  const read = await api('PATCH', `/api/conversations/${convId}/read`, { token: ctx.ownerToken });
  const ownerUnread2 = await api('GET', '/api/conversations/unread-count', { token: ctx.ownerToken });
  check('after owner marks inquiry read → unread 0', read.ok && (ownerUnread2.json?.data?.count || 0) === 0, `read=${read.status} count=${ownerUnread2.json?.data?.count}`);
}

async function suiteNotifications(ctx) {
  section('NOTIFICATIONS — list / unread / mark-read endpoints');
  // In-app notifications aren't wired into the flows yet (phase-1 model only), so
  // seed rows directly and exercise the read API the frontend bell uses.
  const seeded = await Notification.insertMany([
    { user: ctx.customer.id, role: 'customer', type: 'message', title: 'New message', body: 'You have a new message' },
    { user: ctx.customer.id, role: 'customer', type: 'booking_confirmed', title: 'Booking confirmed', body: 'Your trip is confirmed' }
  ]);
  seeded.forEach((n) => created.notificationIds.push(n._id));

  // a notification for someone else — must never be visible/markable by customer
  const other = await Notification.create({ user: ctx.owner._id, role: 'owner', type: 'message', title: 'Not yours' });
  created.notificationIds.push(other._id);

  const list = await api('GET', '/api/notifications', { token: ctx.customer.token });
  const mineCount = (list.json?.data || []).filter((n) => created.notificationIds.some((id) => String(id) === String(n._id))).length;
  check('list returns the customer\'s 2 notifications (not the owner\'s)', list.ok && mineCount === 2, `${list.status} mine=${mineCount}`);

  const unread1 = await api('GET', '/api/notifications/unread-count', { token: ctx.customer.token });
  check('unread-count ≥ 2', (unread1.json?.data?.count || 0) >= 2, `count=${unread1.json?.data?.count}`);

  const markOther = await api('PATCH', `/api/notifications/${other._id}/read`, { token: ctx.customer.token });
  check('cannot mark another user\'s notification → 404', markOther.status === 404, `got ${markOther.status}`);

  const markMine = await api('PATCH', `/api/notifications/${seeded[0]._id}/read`, { token: ctx.customer.token });
  check('mark own notification read → 200', markMine.ok, `${markMine.status}`);

  const readAll = await api('PATCH', '/api/notifications/read-all', { token: ctx.customer.token });
  const unread2 = await api('GET', '/api/notifications/unread-count', { token: ctx.customer.token });
  check('read-all → unread-count back to 0', readAll.ok && (unread2.json?.data?.count || 0) === 0, `readAll=${readAll.status} count=${unread2.json?.data?.count}`);
}

// ── Teardown: delete ONLY what this run created ──────────────────────────────
async function teardown() {
  header('TEARDOWN — deleting only this run’s data');
  try {
    if (created.bookingIds.length) {
      await Message.deleteMany({ booking: { $in: created.bookingIds } });
      const r = await Booking.deleteMany({ _id: { $in: created.bookingIds } });
      log(`bookings deleted: ${r.deletedCount}/${created.bookingIds.length} (+ their messages)`);
    }
    if (created.conversationIds.length) {
      await ConversationMessage.deleteMany({ conversationId: { $in: created.conversationIds } });
      const r = await Conversation.deleteMany({ _id: { $in: created.conversationIds } });
      log(`inquiries deleted: ${r.deletedCount}/${created.conversationIds.length} (+ their messages)`);
    }
    if (created.notificationIds.length) {
      const r = await Notification.deleteMany({ _id: { $in: created.notificationIds } });
      log(`notifications deleted: ${r.deletedCount}/${created.notificationIds.length}`);
    }
    if (created.boatIds.length) { const r = await Boat.deleteMany({ _id: { $in: created.boatIds } }); log(`boats deleted:    ${r.deletedCount}/${created.boatIds.length}`); }
    if (created.userIds.length) { const r = await User.deleteMany({ _id: { $in: created.userIds } }); log(`users deleted:    ${r.deletedCount}/${created.userIds.length}`); }
    const strayUsers = await User.countDocuments({ email: new RegExp(`^${TAG}-`) });
    const strayBoats = await Boat.countDocuments({ name: new RegExp(`${TS}`) });
    log(`stray after cleanup → users=${strayUsers} boats=${strayBoats}`);
  } catch (err) { console.error('  Teardown error (manual cleanup may be needed):', err.message); }
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  header('Water City Rental — E2E FULL SUITE (Stripe TEST)');
  log(`API_BASE = ${API_BASE}`);
  log(`Stripe   = ${STRIPE_KEY.slice(0, 8)}… (TEST)`);
  log(`Webhook  = ${SIGNED_WEBHOOK ? 'SIGNED (verified by backend)' : 'unsigned local-dev fallback'}`);

  assertTestMode();
  await assertBackendUp();
  await mongoose.connect(MONGO_URI);
  log(`Mongo connected: ${mongoose.connection.host}/${mongoose.connection.name}`);

  try {
    header('SETUP — fixtures');
    const owner = await makeConnectUser({ name: 'E2E Owner', role: 'owner', email: `${TAG}-owner@test.local` });
    const captain = await makeConnectUser({ name: 'E2E Captain', role: 'captain', email: `${TAG}-captain@test.local`, captainProfile: { dayRate: CAP_DAY, hourlyRate: 40, yearsExperience: 5 } });
    const captain2 = await makeConnectUser({ name: 'E2E Captain 2', role: 'captain', email: `${TAG}-captain2@test.local`, captainProfile: { dayRate: CAP_DAY, hourlyRate: 40, yearsExperience: 7 } });
    const customer = await registerCustomer('1');
    const outsider = await registerCustomer('2'); // a customer NOT party to the trip
    log(`owner=${owner.email}  captain=${captain.email}  customer=${customer.email}`);

    const ctx = {
      owner, captain, captain2, customer, outsider,
      ownerToken: await loginToken(owner.email),
      captainToken: await loginToken(captain.email)
    };

    // Order matters: happy-path leaves a paid booking that the messages suite reuses.
    await suiteAuth(ctx);
    await suiteBookingHappyPath(ctx);
    await suiteBookingCaptainReassign(ctx);
    await suiteBookingOwnerDecline(ctx);
    await suitePayments(ctx);
    await suiteMessages(ctx);
    await suiteInquiries(ctx);
    await suiteNotifications(ctx);
  } catch (err) {
    console.error('\nSUITE ABORTED (a fixture/setup step threw):', err.message);
    results.push({ section: currentSection || 'SETUP', label: 'suite reached the end without throwing', pass: false, detail: err.message });
  } finally {
    await teardown();
    await mongoose.disconnect();
  }

  // ── Summary ─────────────────────────────────────────────────────────────────
  header('SUMMARY');
  let failed = 0;
  let lastSection = '';
  for (const r of results) {
    if (r.section !== lastSection) { console.log(`\n  ── ${r.section} ──`); lastSection = r.section; }
    if (!r.pass) failed++;
    console.log(`  [${r.pass ? 'PASS' : 'FAIL'}] ${r.label}`);
    if (!r.pass && r.detail) console.log(`         ${r.detail}`);
  }
  console.log(`\n  ${results.length - failed}/${results.length} checks passed.`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((err) => {
  console.error('\nFATAL:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
