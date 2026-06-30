// Unified messaging test: pre-booking customer↔owner inquiry → booking adds the
// captain to the SAME thread with a SYSTEM divider; thread flips Inquiry→Trip.
// Tracks + deletes only its own _ids.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(__dirname, '../.env') });
const Boat = (await import(BACKEND + '/src/models/Boat.js')).default;
const User = (await import(BACKEND + '/src/models/User.js')).default;
const Booking = (await import(BACKEND + '/src/models/Booking.js')).default;
const Conversation = (await import(BACKEND + '/src/models/Conversation.js')).default;
const ConvMsg = (await import(BACKEND + '/src/models/ConversationMessage.js')).default;

const API = 'http://localhost:5000';
const TS = Date.now();
const created = { users: [], boats: [], bookings: [], convs: [] };
async function api(method, p, { token, body } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(API + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = JSON.parse(await r.text()); } catch {}
  return { status: r.status, ok: r.ok, json: j };
}
let failed = 0;
const pass = (m, c) => { if (!c) failed++; console.log((c ? '  ✓ ' : '  ✗ FAIL ') + m); };

await mongoose.connect(process.env.MONGO_URI);
try {
  const owner = await User.create({ name: 'UC Owner', email: `uc-${TS}-owner@test.local`, password: 'Test1234', phone: '5550000001', role: 'owner', isActive: true, stripeAccountId: 'acct_x', stripeOnboardingComplete: true });
  const captain = await User.create({ name: 'Marco Rossi', email: `uc-${TS}-captain@test.local`, password: 'Test1234', phone: '5550000002', role: 'captain', isActive: true, captainProfile: { dayRate: 200, hourlyRate: 40, yearsExperience: 5 }, stripeAccountId: 'acct_y', stripeOnboardingComplete: true });
  created.users.push(owner._id, captain._id);
  const boat = await Boat.create({ name: `UC Boat ${TS}`, type: 'Powerboat', maxGuests: 8, harbor: 'Monroe Harbor', city: 'Chicago', rateType: 'hourly', hourlyRate: 100, owner: owner._id, status: 'active', cancellationPolicy: 'standard' });
  created.boats.push(boat._id);
  const reg = await api('POST', '/api/auth/register', { body: { name: 'UC Customer', email: `uc-${TS}-cust@test.local`, password: 'Test1234', phone: '5550000003', role: 'customer' } });
  const custTok = reg.json.accessToken; created.users.push(reg.json.user.id);
  const ownerTok = (await api('POST', '/api/auth/login', { body: { email: owner.email, password: 'Test1234' } })).json.accessToken;
  const capTok = (await api('POST', '/api/auth/login', { body: { email: captain.email, password: 'Test1234' } })).json.accessToken;

  // Pre-booking
  const c1 = await api('POST', '/api/conversations', { token: custTok, body: { boatId: String(boat._id) } });
  const convId = c1.json?.data?._id; if (convId) created.convs.push(convId);
  pass('customer starts (customer,boat) thread, owner participant', c1.status === 201 && String(c1.json.data.ownerId._id) === String(owner._id));
  await api('POST', `/api/conversations/${convId}/messages`, { token: custTok, body: { body: 'Hi, is this boat free Saturday?' } });
  await api('POST', `/api/conversations/${convId}/messages`, { token: ownerTok, body: { body: 'Yes! Happy to host you.' } });

  const custList1 = (await api('GET', '/api/conversations', { token: custTok })).json.data;
  const conv1 = custList1.find((c) => String(c._id) === String(convId));
  pass('pre-booking: thread labeled Inquiry (isInquiry=true, no bookingId)', conv1 && conv1.isInquiry === true && !conv1.bookingId);

  const capBefore = (await api('GET', '/api/conversations', { token: capTok })).json.data;
  pass('captain does NOT see the thread before booking', !capBefore.some((c) => String(c._id) === String(convId)));

  // Book with captain
  const start = new Date(Date.now() + 10 * 86400000), end = new Date(Date.now() + 10 * 86400000 + 3 * 3600000);
  const bk = await api('POST', '/api/bookings', { token: custTok, body: { boatId: String(boat._id), captainId: String(captain._id), startDate: start.toISOString(), endDate: end.toISOString(), numGuests: 4 } });
  if (bk.json?.data?._id) created.bookings.push(bk.json.data._id);
  pass('booking created with captain', bk.status === 201);
  await new Promise((r) => setTimeout(r, 700));

  const capMsgs = (await api('GET', `/api/conversations/${convId}/messages`, { token: capTok })).json.data || [];
  pass('captain joined + reads pre-booking history', capMsgs.some((m) => m.body === 'Hi, is this boat free Saturday?'));

  const sys = capMsgs.find((m) => m.kind === 'system');
  pass('a SYSTEM divider marks the booking ("Trip booked … joined")', !!sys && /Trip booked/.test(sys.body) && /Marco Rossi/.test(sys.body));

  const custList2 = (await api('GET', '/api/conversations', { token: custTok })).json.data;
  const conv2 = custList2.find((c) => String(c._id) === String(convId));
  pass('post-booking: thread labeled Trip (isInquiry=false, bookingId set)', conv2 && conv2.isInquiry === false && !!conv2.bookingId);

  const m3 = await api('POST', `/api/conversations/${convId}/messages`, { token: capTok, body: { body: 'Captain here — looking forward to it!' } });
  const ownerMsgs = (await api('GET', `/api/conversations/${convId}/messages`, { token: ownerTok })).json.data || [];
  pass('captain message visible to owner+customer (group chat)', m3.status === 201 && ownerMsgs.some((m) => m.body === 'Captain here — looking forward to it!'));

  const ownerUnread = (await api('GET', '/api/conversations/unread-count', { token: ownerTok })).json.data.count;
  pass('system divider EXCLUDED from unread (owner = 2 real msgs, not 3)', ownerUnread === 2);

  const threadsForBoat = custList2.filter((c) => c.boat && String(c.boat._id) === String(boat._id));
  pass('exactly ONE thread per (customer, boat)', threadsForBoat.length === 1);
} catch (e) {
  console.error('THREW:', e.message); failed++;
} finally {
  await ConvMsg.deleteMany({ conversationId: { $in: created.convs } });
  await Conversation.deleteMany({ _id: { $in: created.convs } });
  await Booking.deleteMany({ _id: { $in: created.bookings } });
  await Boat.deleteMany({ _id: { $in: created.boats } });
  await User.deleteMany({ _id: { $in: created.users } });
  console.log('  (cleaned up test data)');
  await mongoose.disconnect();
}
console.log(failed === 0 ? '\nALL UNIFIED-CHAT CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
