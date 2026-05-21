import mongoose from 'mongoose';
import User from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

const CAPTAIN_PROFILE_FIELDS = [
  'dayRate', 'hourlyRate', 'yearsExperience', 'licenseNumber', 'bio'
];

export const listCaptains = async (req, res, next) => {
  try {
    const { minRating, maxDayRate } = req.query;

    const query = { role: 'captain', isActive: true };
    if (minRating) query['captainProfile.rating'] = { $gte: Number(minRating) };
    if (maxDayRate) query['captainProfile.dayRate'] = { $lte: Number(maxDayRate) };

    const captains = await User.find(query)
      .select('name avatar captainProfile')
      .sort({ 'captainProfile.rating': -1 });

    res.status(200).json({ success: true, data: captains });
  } catch (err) {
    next(err);
  }
};

// PUBLIC (no auth). Flat list of verified, active captains sorted by
// rating. Whitelists public-safe output only — never email/phone/
// password/licenseNumber. Optional fields (avatar, languages) are
// omitted when the captain hasn't filled them in.
export const listPublicCaptains = async (req, res, next) => {
  try {
    const captains = await User.find({ role: 'captain', isActive: true, isVerified: true })
      .select('name avatar bio captainProfile')
      .sort({ 'captainProfile.rating': -1 })
      .lean();

    const data = captains.map((c) => {
      const p = c.captainProfile || {};
      const out = {
        id: c._id,
        name: c.name,
        rating: p.rating || 0,
        trips: p.totalTrips || 0,
        bio: p.bio || c.bio || ''
      };
      if (p.dayRate != null) out.dayRate = p.dayRate;
      if (p.hourlyRate != null) out.hourlyRate = p.hourlyRate;
      if (p.yearsExperience != null) out.yearsExperience = p.yearsExperience;
      if (c.avatar) out.avatar = c.avatar;
      if (Array.isArray(p.languages) && p.languages.length) out.languages = p.languages;
      return out;
    });

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

export const getCaptainById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      throw new ApiError(404, 'Captain not found');
    }

    const captain = await User.findOne({
      _id: req.params.id,
      role: 'captain'
    }).select('name avatar bio captainProfile');

    if (!captain) throw new ApiError(404, 'Captain not found');

    res.status(200).json({
      success: true,
      data: {
        id: captain._id,
        name: captain.name,
        avatar: captain.avatar,
        bio: captain.bio,
        captainProfile: captain.captainProfile,
        totalTrips: captain.captainProfile?.totalTrips || 0
      }
    });
  } catch (err) {
    next(err);
  }
};

export const updateMyCaptainProfile = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user.captainProfile) user.captainProfile = {};

    for (const field of CAPTAIN_PROFILE_FIELDS) {
      if (req.body[field] !== undefined) {
        user.captainProfile[field] = req.body[field];
      }
    }

    user.markModified('captainProfile');
    await user.save();

    res.status(200).json({ success: true, data: user.captainProfile });
  } catch (err) {
    next(err);
  }
};
