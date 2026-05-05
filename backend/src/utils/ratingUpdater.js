import Review from '../models/Review.js';
import Boat from '../models/Boat.js';
import User from '../models/User.js';

export async function updateBoatRating(boatId) {
  const reviews = await Review.find({ boat: boatId }).select('boatRating');
  if (reviews.length === 0) {
    await Boat.findByIdAndUpdate(boatId, { rating: 0 });
    return;
  }
  const sum = reviews.reduce((s, r) => s + r.boatRating, 0);
  const avg = Math.round((sum / reviews.length) * 10) / 10;
  await Boat.findByIdAndUpdate(boatId, { rating: avg });
}

export async function updateCaptainRating(captainId) {
  const reviews = await Review.find({ captain: captainId }).select('captainRating');
  const totalTrips = reviews.length;
  if (totalTrips === 0) {
    await User.findByIdAndUpdate(captainId, {
      'captainProfile.rating': 0,
      'captainProfile.totalTrips': 0
    });
    return;
  }
  const sum = reviews.reduce((s, r) => s + r.captainRating, 0);
  const avg = Math.round((sum / totalTrips) * 10) / 10;
  await User.findByIdAndUpdate(captainId, {
    'captainProfile.rating': avg,
    'captainProfile.totalTrips': totalTrips
  });
}
