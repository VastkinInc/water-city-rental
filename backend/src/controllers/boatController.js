import mongoose from 'mongoose';
import Boat from '../models/Boat.js';
import { ApiError } from '../utils/ApiError.js';
import { deleteFromCloudinary } from '../utils/cloudinary.js';

const ALLOWED_UPDATE_FIELDS = [
  'name', 'type', 'yearBuilt', 'length', 'maxGuests', 'harbor',
  'description', 'amenities', 'rateType', 'dayRate', 'hourlyRate',
  'recommendedCaptain'
];

const filesToPhotos = (files = []) =>
  files.map((f) => ({ url: f.path, publicId: f.filename }));

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

export const createBoat = async (req, res, next) => {
  try {
    const photos = filesToPhotos(req.files);

    const boat = await Boat.create({
      ...req.body,
      photos,
      owner: req.user._id,
      status: 'pending'
    });

    res.status(201).json({ success: true, data: boat });
  } catch (err) {
    next(err);
  }
};

export const listBoats = async (req, res, next) => {
  try {
    const {
      harbor, type, guests,
      minPrice, maxPrice, search,
      page: pageRaw, limit: limitRaw, sort
    } = req.query;

    const query = { status: 'active' };

    if (harbor) query.harbor = harbor;
    if (type) query.type = type;
    if (guests) query.maxGuests = { $gte: Number(guests) };

    if (minPrice || maxPrice) {
      const min = minPrice ? Number(minPrice) : undefined;
      const max = maxPrice ? Number(maxPrice) : undefined;
      const range = {};
      if (min !== undefined) range.$gte = min;
      if (max !== undefined) range.$lte = max;
      query.$or = [{ dayRate: range }, { hourlyRate: range }];
    }

    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.name = { $regex: safe, $options: 'i' };
    }

    let sortBy = { createdAt: -1 };
    if (sort === 'price_asc') sortBy = { dayRate: 1, hourlyRate: 1 };
    else if (sort === 'price_desc') sortBy = { dayRate: -1, hourlyRate: -1 };
    else if (sort === 'rating') sortBy = { rating: -1 };
    else if (sort === 'newest') sortBy = { createdAt: -1 };

    const page = Math.max(1, Number(pageRaw) || 1);
    const limit = Math.min(50, Math.max(1, Number(limitRaw) || 12));
    const skip = (page - 1) * limit;

    const [boats, total] = await Promise.all([
      Boat.find(query)
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .populate('owner', 'name')
        .populate('recommendedCaptain', 'name avatar captainProfile'),
      Boat.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      data: {
        boats,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getBoatById = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Boat not found');
    }

    const boat = await Boat.findById(req.params.id)
      .populate('owner', 'name avatar')
      .populate('recommendedCaptain', 'name avatar captainProfile');

    if (!boat) throw new ApiError(404, 'Boat not found');

    if (boat.status !== 'active') {
      const requester = req.user;
      const isOwner = requester && boat.owner && boat.owner._id.equals(requester._id);
      const isAdmin = requester && requester.role === 'admin';
      if (!isOwner && !isAdmin) {
        throw new ApiError(404, 'Boat not found');
      }
    }

    res.status(200).json({ success: true, data: boat });
  } catch (err) {
    next(err);
  }
};

export const updateBoat = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Boat not found');
    }

    const boat = await Boat.findById(req.params.id);
    if (!boat) throw new ApiError(404, 'Boat not found');

    if (req.user.role !== 'admin' && !boat.owner.equals(req.user._id)) {
      throw new ApiError(403, 'Not authorized to update this boat');
    }

    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (req.body[field] !== undefined) {
        boat[field] = req.body[field];
      }
    }

    if (req.files && req.files.length > 0) {
      boat.photos.push(...filesToPhotos(req.files));
    }

    await boat.save();

    res.status(200).json({ success: true, data: boat });
  } catch (err) {
    next(err);
  }
};

export const deleteBoat = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Boat not found');
    }

    const boat = await Boat.findById(req.params.id);
    if (!boat) throw new ApiError(404, 'Boat not found');

    if (req.user.role !== 'admin' && !boat.owner.equals(req.user._id)) {
      throw new ApiError(403, 'Not authorized to delete this boat');
    }

    for (const photo of boat.photos) {
      await deleteFromCloudinary(photo.publicId);
    }

    await boat.deleteOne();

    res.status(200).json({ success: true, message: 'Boat deleted' });
  } catch (err) {
    next(err);
  }
};

export const getMyBoats = async (req, res, next) => {
  try {
    const boats = await Boat.find({ owner: req.user._id })
      .sort({ createdAt: -1 })
      .populate('recommendedCaptain', 'name avatar captainProfile');

    res.status(200).json({ success: true, data: boats });
  } catch (err) {
    next(err);
  }
};

export const deleteBoatPhoto = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Boat not found');
    }

    const boat = await Boat.findById(req.params.id);
    if (!boat) throw new ApiError(404, 'Boat not found');

    if (req.user.role !== 'admin' && !boat.owner.equals(req.user._id)) {
      throw new ApiError(403, 'Not authorized to modify this boat');
    }

    const { publicId } = req.params;
    const photo = boat.photos.find((p) => p.publicId === publicId);
    if (!photo) throw new ApiError(404, 'Photo not found');

    await deleteFromCloudinary(publicId);
    boat.photos = boat.photos.filter((p) => p.publicId !== publicId);
    await boat.save();

    res.status(200).json({ success: true, message: 'Photo deleted', data: boat });
  } catch (err) {
    next(err);
  }
};

export const updateBoatStatus = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      throw new ApiError(404, 'Boat not found');
    }

    const { status } = req.body;
    if (!['pending', 'active', 'inactive'].includes(status)) {
      throw new ApiError(400, 'Status must be pending, active, or inactive');
    }

    const boat = await Boat.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!boat) throw new ApiError(404, 'Boat not found');

    res.status(200).json({ success: true, data: boat });
  } catch (err) {
    next(err);
  }
};
