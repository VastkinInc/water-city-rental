// ─────────────────────────────────────────────────────────────────────────────
// One-time / re-runnable cleanup: expire abandoned UNPAID bookings.
//
// An unpaid request that's still in an active state (pending / needs_new_captain
// / confirmed) is an abandoned cart: it shows up as a real booking, blocks dates,
// and (if it was approved) shows projected earnings. This marks such bookings as
// `cancelled` so they drop out of every queue. It NEVER touches paid, refunded,
// completed, or already-cancelled bookings.
//
// Modeled on wipe-test-data.mjs (env-driven, idempotent). DRY-RUN by default —
// it only writes when you pass --apply.
//
// Usage (from anywhere — .env is loaded relative to this file):
//   node backend/scripts/expire-unpaid-bookings.mjs                 # dry run
//   node backend/scripts/expire-unpaid-bookings.mjs --minutes=60    # set age cutoff (default 60)
//   node backend/scripts/expire-unpaid-bookings.mjs --apply         # actually cancel them
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import Booking from '../src/models/Booking.js';
import Boat from '../src/models/Boat.js';
import User from '../src/models/User.js';

const APPLY = process.argv.includes('--apply');
const minutesArg = process.argv.find((a) => a.startsWith('--minutes='));
const MIN_AGE_MIN = minutesArg ? Number(minutesArg.split('=')[1]) : 60;

// Abandoned = unpaid/failed AND still in an active (non-terminal) state.
// Terminal states (cancelled/completed) and paid/refunded bookings are excluded.
const ACTIVE_STATUSES = ['pending', 'needs_new_captain', 'confirmed'];
const UNPAID_STATUSES = ['unpaid', 'failed'];

const run = async () => {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI is not set'); process.exit(1); }
  if (Number.isNaN(MIN_AGE_MIN) || MIN_AGE_MIN < 0) { console.error('--minutes must be a non-negative number'); process.exit(1); }

  const conn = await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected: host=${conn.connection.host} db=${conn.connection.name}`);
  console.log(`Mode: ${APPLY ? 'APPLY (will write)' : 'DRY-RUN (no writes)'}   age cutoff: > ${MIN_AGE_MIN} min\n`);

  const cutoff = new Date(Date.now() - MIN_AGE_MIN * 60 * 1000);
  const query = {
    status: { $in: ACTIVE_STATUSES },
    paymentStatus: { $in: UNPAID_STATUSES },
    createdAt: { $lt: cutoff }
  };

  const targets = await Booking.find(query)
    .populate('boat', 'name')
    .populate('customer', 'name email')
    .sort({ createdAt: 1 });

  console.log(`--- TARGETS (status ∈ {${ACTIVE_STATUSES.join(', ')}}, paymentStatus ∈ {${UNPAID_STATUSES.join(', ')}}, age > ${MIN_AGE_MIN}m) ---`);
  console.log(`matched: ${targets.length}\n`);
  const now = Date.now();
  for (const b of targets) {
    const ageH = ((now - new Date(b.createdAt).getTime()) / 3600000).toFixed(1);
    console.log(
      `  ${String(b.bookingNumber || '(none)').padEnd(16)}` +
      ` | status: ${String(b.status).padEnd(16)}` +
      ` | paid: ${String(b.paymentStatus).padEnd(7)}` +
      ` | boat: ${String(b.boat?.name || '?').padEnd(18)}` +
      ` | cust: ${String(b.customer?.name || '?').padEnd(14)}` +
      ` | age: ${ageH}h` +
      ` | _id: ${b._id}`
    );
  }

  if (!targets.length) {
    console.log('\nNothing to expire. Done.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (!APPLY) {
    console.log('\nDRY-RUN only — no changes made. Re-run with --apply to cancel the bookings above.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // APPLY: mark each cancelled with an audit trail. We do NOT call Stripe (these
  // are unpaid — there is nothing to refund) and we do NOT delete (preserve the
  // record). Per-document save so the timeline entry is appended cleanly.
  let updated = 0;
  const at = new Date();
  for (const b of targets) {
    b.status = 'cancelled';
    b.cancelledAt = at;
    b.cancellationReason = 'Auto-expired: unpaid (cleanup)';
    b.refundAmount = 0;
    b.timeline.push({ event: 'cancelled', timestamp: at, note: 'Auto-expired: unpaid request (cleanup script)' });
    await b.save();
    updated++;
  }
  console.log(`\nAPPLIED: ${updated}/${targets.length} bookings marked cancelled.`);

  // Verify none remain under the same query.
  const remaining = await Booking.countDocuments(query);
  console.log(`Remaining matches after apply: ${remaining} ${remaining === 0 ? '✓' : '(unexpected — investigate)'}`);

  await mongoose.disconnect();
  process.exit(remaining === 0 ? 0 : 1);
};

run().catch((err) => {
  console.error('Script failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
