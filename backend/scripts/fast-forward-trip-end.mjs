// One-off: fast-forward the most recent payoutStatus='held' booking's
// tripEndAt to 1 hour ago, so the release endpoint considers it due.
// For end-to-end testing of the P3 auto-release flow. Affects ONE booking.
//
// Usage:  node backend/scripts/fast-forward-trip-end.mjs
//         node backend/scripts/fast-forward-trip-end.mjs --dry  (report only)
import 'dotenv/config';
import mongoose from 'mongoose';

import Booking from '../src/models/Booking.js';
import User from '../src/models/User.js';   // eslint-disable-line no-unused-vars
import Boat from '../src/models/Boat.js';   // eslint-disable-line no-unused-vars

const DRY = process.argv.includes('--dry');

function snapshot(b) {
  return {
    _id: b._id.toString(),
    bookingNumber: b.bookingNumber,
    customerEmail: b.customer && b.customer.email,
    boatName: b.boat && b.boat.name,
    tripEndAt: b.tripEndAt,
    payoutStatus: b.payoutStatus,
    grandTotal: b.pricing && b.pricing.grandTotal,
    payoutOwnerAmount: b.payoutOwnerAmount,
    payoutCaptainAmount: b.payoutCaptainAmount,
    platformTaxAmount: b.platformTaxAmount
  };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const booking = await Booking.findOne({ payoutStatus: 'held' })
    .sort({ createdAt: -1 })
    .populate('customer', 'email')
    .populate('boat',     'name');

  if (!booking) {
    console.log('No held bookings found.');
    await mongoose.disconnect();
    return;
  }

  console.log('Found held booking:');
  console.log(snapshot(booking));

  if (DRY) {
    console.log('\n(--dry) no changes written.');
    await mongoose.disconnect();
    return;
  }

  const newTripEndAt = new Date(Date.now() - 60 * 60 * 1000);
  await Booking.updateOne(
    { _id: booking._id },
    { $set: { tripEndAt: newTripEndAt } }
  );

  const updated = await Booking.findById(booking._id)
    .populate('customer', 'email')
    .populate('boat',     'name');

  console.log('\nUpdated booking:');
  console.log(snapshot(updated));

  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
