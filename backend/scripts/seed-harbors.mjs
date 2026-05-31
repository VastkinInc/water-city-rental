// Idempotent harbor seed for the 7 launch cities.
// Re-running is safe — each (cityKey, name) pair is upsert-keyed.
// Usage:  node backend/scripts/seed-harbors.mjs
//         node backend/scripts/seed-harbors.mjs --dry   (report only)
import 'dotenv/config';
import mongoose from 'mongoose';

import Harbor from '../src/models/Harbor.js';

const DRY = process.argv.includes('--dry');

const SEED = [
  {
    city: 'Chicago, IL',
    cityKey: 'chicago_il',
    isPreliminary: false,
    harbors: [
      'Montrose Harbor',
      'Belmont Harbor',
      'Diversey Harbor',
      'DuSable Harbor',
      'Monroe Harbor',
      'Burnham Harbor',
      '31st Street Harbor',
      '59th Street Harbor'
    ]
  },
  {
    city: 'Miami, FL',
    cityKey: 'miami_fl',
    isPreliminary: true,
    harbors: [
      'Miami Beach Marina',
      'Miamarina at Bayside',
      'Dinner Key Marina',
      'Sunset Harbour Yacht Club',
      'Grove Harbour Marina',
      'Yacht Haven Grande'
    ]
  },
  {
    city: 'Tampa, FL',
    cityKey: 'tampa_fl',
    isPreliminary: true,
    harbors: [
      'Marina Pointe',
      'Westshore Yacht Club',
      'Harborage Marina (St. Petersburg)',
      'Marriott Tampa Water Street Marina',
      'Clearwater Beach Marina',
      'Tampa Harbour Yacht Club'
    ]
  },
  {
    city: 'Washington, DC',
    cityKey: 'washington_dc',
    isPreliminary: true,
    harbors: [
      'The Wharf Marina',
      'James Creek Marina',
      'National Harbor Marina',
      'Capital Cove Marina',
      'Gangplank Marina'
    ]
  },
  {
    city: 'Austin, TX',
    cityKey: 'austin_tx',
    isPreliminary: true,
    harbors: [
      'Lakeway Marina',
      'VIP Marina Lake Travis',
      'Riviera Marina',
      'Paradise Cove Marina',
      'Walsh Boat Landing',
      'Loop 360 Boat Ramp'
    ]
  },
  {
    city: 'New York, NY',
    cityKey: 'new_york_ny',
    isPreliminary: true,
    harbors: [
      'North Cove Marina',
      'Skyport Marina',
      'Chelsea Piers Marina',
      'ONE°15 Brooklyn Marina',
      'Dyckman Marina',
      'Pier 25 Marina'
    ]
  },
  {
    city: 'Los Angeles, CA',
    cityKey: 'los_angeles_ca',
    isPreliminary: true,
    harbors: [
      'Marina del Rey Main Channel',
      'Burton Chace Park Dock',
      "Fisherman's Village Marina",
      'Bay Club Marina',
      'Tahiti Marina',
      'Del Rey Yacht Club'
    ]
  }
];

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Aborting.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB.');

  const before = await Harbor.countDocuments();
  console.log(`Harbors before seed: ${before}`);

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const block of SEED) {
    for (const name of block.harbors) {
      const filter = { cityKey: block.cityKey, name };
      const update = {
        $set: {
          name,
          city: block.city,
          cityKey: block.cityKey,
          isPreliminary: block.isPreliminary,
          active: true
        }
      };

      if (DRY) {
        const existing = await Harbor.findOne(filter).lean();
        if (!existing) {
          inserted++;
          console.log(`  + would insert: ${block.city} / ${name}`);
        } else if (
          existing.city !== block.city ||
          existing.isPreliminary !== block.isPreliminary ||
          existing.active !== true
        ) {
          updated++;
          console.log(`  ~ would update: ${block.city} / ${name}`);
        } else {
          skipped++;
        }
        continue;
      }

      const res = await Harbor.updateOne(filter, update, { upsert: true });
      if (res.upsertedCount === 1) inserted++;
      else if (res.modifiedCount === 1) updated++;
      else skipped++;
    }
  }

  const after = await Harbor.countDocuments();
  console.log('');
  console.log(`Inserted: ${inserted}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Skipped:  ${skipped}`);
  console.log(`Harbors after seed: ${after}`);
  console.log(DRY ? '(DRY RUN — no writes)' : 'Done.');

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
