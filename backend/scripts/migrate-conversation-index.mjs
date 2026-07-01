// One-time migration: drop the old UNIQUE index on conversations (customerId_1_boatId_1).
// The unified messaging now also stores boat-less customer↔captain threads (boatId: null);
// a unique (customerId, boatId) index would reject a customer's 2nd captain thread (both
// have boatId null). Uniqueness is enforced by get-or-create in the controller instead.
// Safe + idempotent: does nothing if the index is already gone.
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(1); }
await mongoose.connect(process.env.MONGO_URI);
const coll = mongoose.connection.collection('conversations');

const indexes = await coll.indexes();
const names = indexes.map((i) => i.name);
console.log('current conversation indexes:', names.join(', '));

const OLD = 'customerId_1_boatId_1';
const old = indexes.find((i) => i.name === OLD && i.unique);
if (old) {
  await coll.dropIndex(OLD);
  console.log(`dropped UNIQUE index ${OLD}`);
} else if (names.includes(OLD)) {
  console.log(`index ${OLD} exists but is NOT unique — leaving as-is`);
} else {
  console.log(`index ${OLD} not present — nothing to do`);
}

// Re-sync the model's (non-unique) indexes.
const Conversation = (await import('../src/models/Conversation.js')).default;
await Conversation.syncIndexes();
console.log('after sync:', (await coll.indexes()).map((i) => i.name).join(', '));

await mongoose.disconnect();
console.log('done');
