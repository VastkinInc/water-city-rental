// One-off: wipe transactional collections so we can re-test the money path from
// scratch. Touches ONLY the hardcoded list below — users, boats, reviews are
// left alone. Re-runnable; idempotent (second run will report 0 deletions).
//
// Usage:  node backend/scripts/wipe-test-data.mjs
import 'dotenv/config';
import mongoose from 'mongoose';

import Booking from '../src/models/Booking.js';
import Conversation from '../src/models/Conversation.js';
import ConversationMessage from '../src/models/ConversationMessage.js';
import Message from '../src/models/Message.js';
import User from '../src/models/User.js';
import Boat from '../src/models/Boat.js';

const WIPE = [
  { name: 'Booking',             Model: Booking },
  { name: 'Conversation',        Model: Conversation },
  { name: 'ConversationMessage', Model: ConversationMessage },
  { name: 'Message',             Model: Message }
];

const KEEP = [
  { name: 'User', Model: User },
  { name: 'Boat', Model: Boat }
];

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set'); process.exit(1);
  }

  const conn = await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected: host=${conn.connection.host} db=${conn.connection.name}`);
  console.log('');

  console.log('--- KEEP (sanity, BEFORE) ---');
  const keepBefore = {};
  for (const { name, Model } of KEEP) {
    keepBefore[name] = await Model.countDocuments();
    console.log(`  ${name.padEnd(22)} ${keepBefore[name]}`);
  }
  console.log('');

  console.log('--- WIPE ---');
  for (const { name, Model } of WIPE) {
    const before = await Model.countDocuments();
    const res    = await Model.deleteMany({});
    const after  = await Model.countDocuments();
    console.log(`  ${name.padEnd(22)} before=${before} deleted=${res.deletedCount} after=${after}`);
  }
  console.log('');

  console.log('--- KEEP (sanity, AFTER) ---');
  let ok = true;
  for (const { name, Model } of KEEP) {
    const after = await Model.countDocuments();
    const match = after === keepBefore[name];
    if (!match) ok = false;
    console.log(`  ${name.padEnd(22)} ${after}  ${match ? '(unchanged ✓)' : '(CHANGED — ALERT)'}`);
  }

  await mongoose.disconnect();
  console.log('');
  console.log(ok ? 'Done. Keep collections unchanged.' : 'WARNING: keep collections changed!');
  process.exit(ok ? 0 : 1);
};

run().catch((err) => {
  console.error('Script failed:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
