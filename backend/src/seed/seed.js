import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import Boat from '../models/Boat.js';

const YACHT_PHOTOS = [
  'https://images.unsplash.com/photo-1567899378494-47b22a2ae96a?w=1200',
  'https://images.unsplash.com/photo-1540946485063-a40da27545f8?w=1200',
  'https://images.unsplash.com/photo-1605281317010-fe5ffe798166?w=1200'
];

const SAIL_DAYCRUISER_PHOTOS = [
  'https://images.unsplash.com/photo-1565599837634-134bc3aadce8?w=1200',
  'https://images.unsplash.com/photo-1518533954129-7774297db60a?w=1200'
];

const SPEED_POWER_PHOTOS = [
  'https://images.unsplash.com/photo-1605281317010-fe5ffe798166?w=1200',
  'https://images.unsplash.com/photo-1563296291-09e2e8db09b1?w=1200'
];

const photosFor = (type, count) => {
  let pool;
  if (type === 'Luxury Yacht' || type === 'Catamaran') pool = YACHT_PHOTOS;
  else if (type === 'Sailboat' || type === 'Day Cruiser') pool = SAIL_DAYCRUISER_PHOTOS;
  else pool = SPEED_POWER_PHOTOS;
  return pool.slice(0, count).map((url) => ({ url, publicId: '' }));
};

const run = async () => {
  await connectDB();

  await User.deleteMany({ email: /@example\.com$/ });
  await User.deleteOne({ email: 'admin@watercityrental.com' });
  await Boat.deleteMany({});
  console.log('🧹 Cleared old seed data');

  const marco = await User.create({
    name: 'Marco Rossi',
    email: 'marco@example.com',
    password: 'password123',
    role: 'captain',
    phone: '+1-312-555-0101',
    city: 'Chicago',
    bio: 'Born and raised on Lake Michigan. 12 years guiding charters.',
    isVerified: true,
    captainProfile: {
      dayRate: 240,
      hourlyRate: 40,
      yearsExperience: 12,
      licenseNumber: 'USCG-IL-2013-04421',
      rating: 4.9,
      totalTrips: 127,
      bio: 'USCG licensed Lake Michigan specialist'
    }
  });

  const sofia = await User.create({
    name: 'Sofia Martinez',
    email: 'sofia@example.com',
    password: 'password123',
    role: 'captain',
    phone: '+1-312-555-0102',
    city: 'Chicago',
    bio: 'Multilingual captain (English/Spanish/Italian).',
    isVerified: true,
    captainProfile: {
      dayRate: 200,
      hourlyRate: 35,
      yearsExperience: 8,
      licenseNumber: 'USCG-IL-2017-08832',
      rating: 4.8,
      totalTrips: 89,
      bio: 'Multilingual sunset cruise expert'
    }
  });

  const james = await User.create({
    name: 'James Chen',
    email: 'james@example.com',
    password: 'password123',
    role: 'captain',
    phone: '+1-312-555-0103',
    city: 'Chicago',
    bio: 'Former US Coast Guard. 15 years on the water with zero incidents.',
    isVerified: true,
    captainProfile: {
      dayRate: 280,
      hourlyRate: 45,
      yearsExperience: 15,
      licenseNumber: 'USCG-IL-2010-01122',
      rating: 5.0,
      totalTrips: 203,
      bio: 'Former Coast Guard, perfect safety record'
    }
  });

  const diana = await User.create({
    name: 'Diana Webb',
    email: 'diana@example.com',
    password: 'password123',
    role: 'captain',
    phone: '+1-312-555-0104',
    city: 'Chicago',
    bio: 'Family-friendly trips are my specialty. Kids love me.',
    isVerified: true,
    captainProfile: {
      dayRate: 180,
      hourlyRate: 30,
      yearsExperience: 6,
      licenseNumber: 'USCG-IL-2019-12203',
      rating: 4.7,
      totalTrips: 64,
      bio: 'Specializes in family-friendly charters'
    }
  });

  const sarah = await User.create({
    name: 'Sarah Chen',
    email: 'sarah@example.com',
    password: 'password123',
    role: 'owner',
    phone: '+1-312-555-0201',
    city: 'Chicago',
    bio: 'Boat owner since 2020. Six premium vessels in Chicago harbors.',
    isVerified: true
  });

  const alex = await User.create({
    name: 'Alex Johnson',
    email: 'alex@example.com',
    password: 'password123',
    role: 'customer',
    phone: '+1-312-555-0301',
    city: 'Chicago',
    bio: 'Weekend boater, love sunset cruises with friends.',
    isVerified: true
  });

  const admin = await User.create({
    name: 'System Admin',
    email: 'admin@watercityrental.com',
    password: 'password123',
    role: 'admin',
    phone: '+1-312-555-0001',
    city: 'Chicago',
    isVerified: true
  });

  const sarahId = sarah._id;
  const marcoId = marco._id;
  const sofiaId = sofia._id;
  const jamesId = james._id;
  const dianaId = diana._id;

  const boats = [
    {
      name: 'Azure Serenity',
      type: 'Luxury Yacht',
      yearBuilt: 2020,
      length: 45,
      maxGuests: 12,
      harbor: 'Monroe Harbor',
      description: 'Sleek 45ft luxury yacht with full galley, two cabins, and panoramic skyline views. Perfect for client entertainment or special occasions on Lake Michigan.',
      amenities: ['WiFi', 'AC', 'Kitchen', 'Bluetooth Audio', 'Restroom', 'Cooler'],
      photos: photosFor('Luxury Yacht', 2),
      rateType: 'daily',
      dayRate: 1200,
      rating: 4.9,
      totalBookings: 24,
      recommendedCaptain: marcoId,
      owner: sarahId,
      status: 'active'
    },
    {
      name: 'Lake Sovereign',
      type: 'Luxury Yacht',
      yearBuilt: 2018,
      length: 32,
      maxGuests: 8,
      harbor: 'Navy Pier',
      description: 'Intimate yacht ideal for small groups. Iconic Navy Pier views and easy access to downtown.',
      amenities: ['WiFi', 'AC', 'Bluetooth Audio', 'Restroom'],
      photos: photosFor('Luxury Yacht', 2),
      rateType: 'daily',
      dayRate: 890,
      rating: 5.0,
      totalBookings: 31,
      recommendedCaptain: jamesId,
      owner: sarahId,
      status: 'active'
    },
    {
      name: 'Solaris Dream',
      type: 'Luxury Yacht',
      yearBuilt: 2022,
      length: 55,
      maxGuests: 20,
      harbor: 'Belmont Harbor',
      description: 'Top-of-the-fleet 55ft yacht. Full crew quarters, gourmet galley, sundeck, and a quiet diesel hum that makes conversation easy.',
      amenities: ['WiFi', 'AC', 'Kitchen', 'Bluetooth Audio', 'Restroom', 'Cooler', 'Sundeck', 'Bar'],
      photos: photosFor('Luxury Yacht', 3),
      rateType: 'daily',
      dayRate: 2400,
      rating: 4.8,
      totalBookings: 18,
      recommendedCaptain: marcoId,
      owner: sarahId,
      status: 'active'
    },
    {
      name: 'Golden Horizon',
      type: 'Day Cruiser',
      yearBuilt: 2019,
      length: 38,
      maxGuests: 12,
      harbor: 'Burnham Harbor',
      description: 'Versatile day cruiser. Great for half-day trips, sunset rides, and small celebrations.',
      amenities: ['WiFi', 'Bluetooth Audio', 'Cooler', 'Restroom'],
      photos: photosFor('Day Cruiser', 2),
      rateType: 'hourly',
      hourlyRate: 320,
      rating: 4.7,
      totalBookings: 47,
      recommendedCaptain: sofiaId,
      owner: sarahId,
      status: 'active'
    },
    {
      name: 'Sea Whisper',
      type: 'Speedboat',
      yearBuilt: 2021,
      length: 24,
      maxGuests: 6,
      harbor: 'Diversey Harbor',
      description: 'Quick, agile speedboat. Pure thrill — Lake Michigan as it was meant to be felt.',
      amenities: ['Bluetooth Audio', 'Cooler'],
      photos: photosFor('Speedboat', 2),
      rateType: 'hourly',
      hourlyRate: 180,
      rating: 4.9,
      totalBookings: 62,
      recommendedCaptain: dianaId,
      owner: sarahId,
      status: 'active'
    },
    {
      name: 'Midnight Sun',
      type: 'Powerboat',
      yearBuilt: 2017,
      length: 32,
      maxGuests: 8,
      harbor: 'DuSable Harbor',
      description: 'Reliable mid-size powerboat. Comfortable, classic, and consistently well-reviewed.',
      amenities: ['Bluetooth Audio', 'Cooler', 'Restroom'],
      photos: photosFor('Powerboat', 2),
      rateType: 'hourly',
      hourlyRate: 280,
      rating: 4.6,
      totalBookings: 39,
      recommendedCaptain: jamesId,
      owner: sarahId,
      status: 'active'
    }
  ];

  await Boat.insertMany(boats);

  console.log('');
  console.log('════════════════════════════════════════');
  console.log('✅ Seed complete');
  console.log('════════════════════════════════════════');
  console.log('Users created:');
  console.log('  - 1 customer  (alex@example.com)');
  console.log('  - 1 owner     (sarah@example.com)');
  console.log('  - 4 captains  (marco/sofia/james/diana@example.com)');
  console.log('  - 1 admin     (admin@watercityrental.com)');
  console.log('Boats created: 6 (all status: active)');
  console.log('');
  console.log('🔑 Login password for ALL test users: password123');
  console.log('════════════════════════════════════════');
};

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('❌ Seed failed:', err);
    try { await mongoose.disconnect(); } catch {}
    process.exit(1);
  });
