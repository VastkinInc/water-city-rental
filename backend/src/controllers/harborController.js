import Harbor from '../models/Harbor.js';

export const listCities = async (req, res, next) => {
  try {
    const rows = await Harbor.aggregate([
      { $match: { active: true } },
      {
        $group: {
          _id: '$cityKey',
          city: { $first: '$city' },
          harborCount: { $sum: 1 },
          isPreliminary: { $max: { $cond: ['$isPreliminary', 1, 0] } }
        }
      },
      { $sort: { isPreliminary: 1, city: 1 } }
    ]);

    const cities = rows.map((r) => ({
      cityKey: r._id,
      city: r.city,
      harborCount: r.harborCount,
      isPreliminary: r.isPreliminary === 1
    }));

    res.status(200).json({ success: true, data: cities });
  } catch (err) {
    next(err);
  }
};

export const listHarbors = async (req, res, next) => {
  try {
    const { city } = req.query;
    const query = { active: true };
    if (city) query.cityKey = String(city).toLowerCase().trim();

    const harbors = await Harbor.find(query).sort({ name: 1 });
    res.status(200).json({ success: true, data: harbors });
  } catch (err) {
    next(err);
  }
};
