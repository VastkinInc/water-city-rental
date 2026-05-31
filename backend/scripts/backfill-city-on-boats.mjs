// Idempotent backfill: assigns `city` to every Boat that lacks it, by looking
// up the boat's `harbor` in the Harbor collection. All pre-existing boats are
// Chicago, so in practice this sets city = "Chicago, IL" on every legacy doc.
//
// Re-running is safe: docs that already have `city` are skipped.
// DO NOT RUN until seed-harbors.mjs has been run first (harbor docs must exist).
//
// Usage:  node backend/scripts/backfill-city-on-boats.mjs
//         node backend/scripts/backfill-city-on-boats.mjs --dry   (report only)
import 'dotenv/config';
import mongoose from 'mongoose';

import Boat from '../src/models/Boat.js';
import Harbor from '../src/models/Harbor.js';

const DRY = process.argv.includes('--dry');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const total = await Boat.countDocuments();
  const before = await Boat.countDocuments({
    $or: [{ city: { $exists: false } }, { city: null }, { city: '' }]
  });
  console.log(`Total boats: ${total}`);
  console.log(`Boats missing city (before): ${before}`);

  const boats = await Boat.find({
    $or: [{ city: { $exists: false } }, { city: null }, { city: '' }]
  });

  let updated = 0;
  let skipped = 0;
  let unresolved = 0;

  for (const boat of boats) {
    const harborName = (boat.harbor || '').trim();
    if (!harborName) {
      skipped++;
      console.log(`  - skip ${boat._id} — no harbor on boat`);
      continue;
    }

    const harborDoc = await Harbor.findOne({ name: harborName, active: true });
    if (!harborDoc) {
      unresolved++;
      console.log(`  ! unresolved ${boat._id} — harbor "${harborName}" not in Harbor collection`);
      continue;
    }

    if (DRY) {
      console.log(`  + would set city="${harborDoc.city}" on ${boat._id} (harbor=${harborName})`);
      updated++;
      continue;
    }

    boat.city = harborDoc.city;
    await boat.save();
    updated++;
    console.log(`  + set city="${harborDoc.city}" on ${boat._id} (harbor=${harborName})`);
  }

  const after = DRY
    ? before - updated
    : await Boat.countDocuments({
        $or: [{ city: { $exists: false } }, { city: null }, { city: '' }]
      });

  console.log('');
  console.log(`Updated:    ${updated}`);
  console.log(`Skipped:    ${skipped}`);
  console.log(`Unresolved: ${unresolved}`);
  console.log(`Boats missing city (after): ${after}`);
  console.log(DRY ? '(DRY RUN — no writes)' : 'Done.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
