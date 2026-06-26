// ─────────────────────────────────────────────────────────────────────────────
// RESET DB FOR CLIENT LIVE TESTING — targeted hard reset.
//
// KEEPS:
//   - the live owner (by email KEEP_OWNER_EMAIL) + that owner's boats
//   - the admin account(s) (role 'admin')
//   - ALL Harbors (seed/config the app requires)
// DELETES everything else:
//   - all other Users (customers/owners/captains that aren't the live owner/admin)
//   - all other Boats (not owned by the preserved owner)
//   - ALL Bookings, Messages, Conversations, ConversationMessages, Reviews
//
// SAFETY:
//   - DRY-RUN by default. Prints the exact delete/keep set; deletes NOTHING.
//   - Writes a full JSON backup of EVERY collection BEFORE any deletion (only on
//     --apply), to ~/wcr-db-backup-<stamp>/.
//   - Never calls Stripe. Never touches Harbors. Re-counts + asserts the keep-set
//     after applying.
//
// Usage (from backend/):
//   node scripts/reset-db-for-live.mjs            # dry-run (no writes)
//   node scripts/reset-db-for-live.mjs --apply    # backup, then delete
// ─────────────────────────────────────────────────────────────────────────────

import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import User from '../src/models/User.js';
import Booking from '../src/models/Booking.js';
import Boat from '../src/models/Boat.js';
import Conversation from '../src/models/Conversation.js';
import ConversationMessage from '../src/models/ConversationMessage.js';
import Message from '../src/models/Message.js';
import Review from '../src/models/Review.js';
import Harbor from '../src/models/Harbor.js';

const APPLY = process.argv.includes('--apply');

// The single live owner to preserve. Confirmed: alex d, the go-live Stripe account.
const KEEP_OWNER_EMAIL = 'watercityllc@gmail.com';

const run = async () => {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI is not set'); process.exit(1); }
  const conn = await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected: host=${conn.connection.host} db=${conn.connection.name}`);
  console.log(`Mode: ${APPLY ? 'APPLY (will back up, then DELETE)' : 'DRY-RUN (no writes)'}\n`);

  // ── Resolve the keep-set ──────────────────────────────────────────────────
  const keepOwner = await User.findOne({ email: KEEP_OWNER_EMAIL }).lean();
  if (!keepOwner) {
    console.error(`ABORT: preserve owner ${KEEP_OWNER_EMAIL} not found. Refusing to run.`);
    await mongoose.disconnect(); process.exit(1);
  }
  const admins = await User.find({ role: 'admin' }).select('_id name email').lean();
  const keepUserIds = new Set([String(keepOwner._id), ...admins.map((a) => String(a._id))]);

  console.log('--- KEEP (users) ---');
  console.log(`  owner: ${keepOwner.name} <${keepOwner.email}> _id=${keepOwner._id} acct=${keepOwner.stripeAccountId}`);
  for (const a of admins) console.log(`  admin: ${a.name} <${a.email}> _id=${a._id}`);

  const keepBoats = await Boat.find({ owner: keepOwner._id }).select('_id name').lean();
  console.log(`--- KEEP (boats owned by preserved owner): ${keepBoats.length} ---`);
  for (const b of keepBoats) console.log(`  boat: ${b.name} _id=${b._id}`);
  const keepBoatIds = new Set(keepBoats.map((b) => String(b._id)));

  const harborCount = await Harbor.countDocuments();
  console.log(`--- KEEP (harbors / seed): ${harborCount} (NEVER deleted) ---\n`);

  // ── Compute the delete-set ────────────────────────────────────────────────
  const usersDelFilter = { _id: { $nin: [...keepUserIds] } };
  const boatsDelFilter = { _id: { $nin: [...keepBoatIds] } };

  const counts = {
    usersDelete: await User.countDocuments(usersDelFilter),
    usersKeep:   keepUserIds.size,
    boatsDelete: await Boat.countDocuments(boatsDelFilter),
    boatsKeep:   keepBoatIds.size,
    bookings:    await Booking.countDocuments(),
    messages:    await Message.countDocuments(),
    conversations: await Conversation.countDocuments(),
    conversationMessages: await ConversationMessage.countDocuments(),
    reviews:     await Review.countDocuments()
  };

  console.log('--- DELETE SET ---');
  console.log(`  Users:                ${counts.usersDelete}  (keep ${counts.usersKeep})`);
  console.log(`  Boats:                ${counts.boatsDelete}  (keep ${counts.boatsKeep})`);
  console.log(`  Bookings:             ${counts.bookings}  (ALL)`);
  console.log(`  Messages:             ${counts.messages}  (ALL)`);
  console.log(`  Conversations:        ${counts.conversations}  (ALL)`);
  console.log(`  ConversationMessages: ${counts.conversationMessages}  (ALL)`);
  console.log(`  Reviews:              ${counts.reviews}  (ALL)`);

  const sampleUsers = await User.find(usersDelFilter).select('name role email').limit(8).lean();
  console.log('  sample users to delete:', sampleUsers.map((u) => `${u.role}:${u.name}`).join(', '));

  if (!APPLY) {
    console.log('\nDRY-RUN only — nothing deleted. Re-run with --apply to back up + delete.');
    await mongoose.disconnect(); process.exit(0);
  }

  // ── BACKUP everything before deleting ─────────────────────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(os.homedir(), `wcr-db-backup-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  const dump = async (name, Model) => {
    const docs = await Model.find({}).lean();
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2));
    return docs.length;
  };
  console.log(`\n--- BACKUP → ${dir} ---`);
  for (const [name, Model] of [
    ['User', User], ['Boat', Boat], ['Booking', Booking], ['Message', Message],
    ['Conversation', Conversation], ['ConversationMessage', ConversationMessage],
    ['Review', Review], ['Harbor', Harbor]
  ]) {
    console.log(`  ${name}: ${await dump(name, Model)} docs`);
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  console.log('\n--- DELETING ---');
  const r = {};
  r.reviews     = (await Review.deleteMany({})).deletedCount;
  r.messages    = (await Message.deleteMany({})).deletedCount;
  r.convMsgs    = (await ConversationMessage.deleteMany({})).deletedCount;
  r.convs       = (await Conversation.deleteMany({})).deletedCount;
  r.bookings    = (await Booking.deleteMany({})).deletedCount;
  r.boats       = (await Boat.deleteMany(boatsDelFilter)).deletedCount;
  r.users       = (await User.deleteMany(usersDelFilter)).deletedCount;
  console.log(`  Reviews ${r.reviews} | Messages ${r.messages} | ConvMsgs ${r.convMsgs} | Conversations ${r.convs} | Bookings ${r.bookings} | Boats ${r.boats} | Users ${r.users}`);

  // ── Verify keep-set intact ────────────────────────────────────────────────
  console.log('\n--- AFTER (keep-set assertions) ---');
  const ownerStill = await User.findById(keepOwner._id).select('name email').lean();
  const adminStill = await User.countDocuments({ role: 'admin' });
  const harborStill = await Harbor.countDocuments();
  const boatStill = await Boat.countDocuments();
  const userStill = await User.countDocuments();
  console.log(`  preserved owner present: ${ownerStill ? 'YES ✓ (' + ownerStill.name + ')' : 'NO — ALERT'}`);
  console.log(`  admins present: ${adminStill}`);
  console.log(`  harbors present: ${harborStill} ${harborStill === harborCount ? '✓' : '(CHANGED — ALERT)'}`);
  console.log(`  boats remaining: ${boatStill} (expected ${keepBoatIds.size})`);
  console.log(`  users remaining: ${userStill} (expected ${keepUserIds.size})`);
  console.log(`  bookings: ${await Booking.countDocuments()} | conversations: ${await Conversation.countDocuments()} | messages: ${await Message.countDocuments()} | reviews: ${await Review.countDocuments()}`);

  const ok = ownerStill && harborStill === harborCount && boatStill === keepBoatIds.size && userStill === keepUserIds.size;
  console.log(`\n${ok ? 'Done. Clean state reached; keep-set intact ✓' : 'WARNING: keep-set mismatch — investigate (backup is at ' + dir + ')'}`);
  console.log(`Backup saved at: ${dir}`);
  await mongoose.disconnect();
  process.exit(ok ? 0 : 1);
};

run().catch((err) => {
  console.error('Script failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
