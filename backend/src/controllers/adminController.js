import User from '../models/User.js';
import Boat from '../models/Boat.js';
import Booking from '../models/Booking.js';

// All endpoints here are READ-ONLY and admin-gated at the route level
// (protect + restrictTo('admin')). Admin sees full figures, including
// grandTotal on bookings (Rule #14: admin sees everything).

export const getStats = async (req, res, next) => {
  try {
    const [
      totalUsers, totalBoats, totalBookings,
      totalCustomers, totalOwners, totalCaptains, totalAdmins,
      pending, needsNewCaptain, confirmed, cancelled, completed,
      unpaid, paid, failed, refunded
    ] = await Promise.all([
      User.countDocuments(),
      Boat.countDocuments(),
      Booking.countDocuments(),
      User.countDocuments({ role: 'customer' }),
      User.countDocuments({ role: 'owner' }),
      User.countDocuments({ role: 'captain' }),
      User.countDocuments({ role: 'admin' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.countDocuments({ status: 'needs_new_captain' }),
      Booking.countDocuments({ status: 'confirmed' }),
      Booking.countDocuments({ status: 'cancelled' }),
      Booking.countDocuments({ status: 'completed' }),
      Booking.countDocuments({ paymentStatus: 'unpaid' }),
      Booking.countDocuments({ paymentStatus: 'paid' }),
      Booking.countDocuments({ paymentStatus: 'failed' }),
      Booking.countDocuments({ paymentStatus: 'refunded' })
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        totalBoats,
        totalBookings,
        totalCustomers,
        totalOwners,
        totalCaptains,
        totalAdmins,
        bookingsByStatus: {
          pending,
          needs_new_captain: needsNewCaptain,
          confirmed,
          cancelled,
          completed
        },
        bookingsByPaymentStatus: { unpaid, paid, failed, refunded }
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    // Whitelist safe fields only — never expose the password hash.
    const users = await User.find()
      .select('name email phone role city isActive isVerified createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
};

export const getBoats = async (req, res, next) => {
  try {
    const boats = await Boat.find()
      .select('name type harbor rateType dayRate hourlyRate status owner rating totalBookings createdAt')
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ success: true, data: boats });
  } catch (err) {
    next(err);
  }
};

export const getBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.find()
      .populate('customer', 'name email')
      .populate('boat', 'name harbor')
      .populate('captain', 'name')
      .sort({ createdAt: -1 })
      .lean();

    const data = bookings.map((b) => ({
      _id: b._id,
      bookingNumber: b.bookingNumber,
      customer: b.customer ? { name: b.customer.name, email: b.customer.email } : null,
      boat: b.boat ? { name: b.boat.name, harbor: b.boat.harbor } : null,
      captain: b.captain ? b.captain.name : 'No Captain',
      startDate: b.startDate,
      endDate: b.endDate,
      status: b.status,
      paymentStatus: b.paymentStatus,
      grandTotal: b.pricing ? b.pricing.grandTotal : 0,
      createdAt: b.createdAt
    }));

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
