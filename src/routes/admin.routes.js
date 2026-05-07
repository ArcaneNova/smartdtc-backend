/**
 * admin.routes.js
 * Admin-only routes for managing bookings, mobile app data, and app-wide settings
 */
const express  = require('express');
const router   = express.Router();
const Booking  = require('../models/Booking');
const User     = require('../models/User');
const Schedule = require('../models/Schedule');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin'));

// ── BOOKING MANAGEMENT ──────────────────────────────────────────────────────

// GET /api/v1/admin/bookings  — paginated list with stats
router.get('/bookings', async (req, res) => {
  try {
    const { page = 1, limit = 15, search, status } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build filter
    const filter = {};
    if (status && status !== 'all') filter.status = status;

    // Build aggregation for search across user name/email/bookingRef
    let bookings, total;
    if (search) {
      // Need to join users to search by name/email
      const userIds = await User.find({
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
        ],
      }, '_id').lean();
      filter.$or = [
        { bookingRef: { $regex: search, $options: 'i' } },
        { user: { $in: userIds.map(u => u._id) } },
      ];
    }

    [bookings, total] = await Promise.all([
      Booking.find(filter)
        .populate('user', 'name email phone')
        .populate('route', 'route_name start_stage end_stage')
        .populate('schedule', 'departureTime arrivalTime date')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Booking.countDocuments(filter),
    ]);

    // Stats (always from full collection, not filtered)
    const [statsRaw] = await Booking.aggregate([
      {
        $group: {
          _id: null,
          total:           { $sum: 1 },
          confirmed:       { $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] } },
          boarded:         { $sum: { $cond: [{ $eq: ['$status', 'boarded'] }, 1, 0] } },
          cancelled:       { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
          completed:       { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalPassengers: { $sum: '$passengers' },
        },
      },
    ]);

    res.json({
      success: true,
      bookings,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)),
      stats: statsRaw || { total: 0, confirmed: 0, boarded: 0, cancelled: 0, completed: 0, totalPassengers: 0 },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/admin/bookings/by-schedule/:scheduleId
router.get('/bookings/by-schedule/:scheduleId', async (req, res) => {
  try {
    const bookings = await Booking.find({ schedule: req.params.scheduleId })
      .populate('user', 'name email phone')
      .sort({ createdAt: 1 })
      .lean();
    res.json({ success: true, bookings, count: bookings.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/admin/bookings/:id
router.get('/bookings/:id', async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('user', 'name email phone')
      .populate('route', 'route_name start_stage end_stage')
      .populate('schedule', 'departureTime arrivalTime date status')
      .lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/admin/bookings/:id  — update status or fare
router.patch('/bookings/:id', async (req, res) => {
  try {
    const { status, fare } = req.body;
    const allowed = ['confirmed', 'boarded', 'cancelled', 'completed'];
    if (status && !allowed.includes(status))
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });

    const update = {};
    if (status) update.status = status;
    if (fare !== undefined) update.fare = fare;

    const booking = await Booking.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('user', 'name email')
      .populate('route', 'route_name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/v1/admin/bookings/:id
router.delete('/bookings/:id', async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Booking deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── APP STATS for admin ────────────────────────────────────────────────────

// GET /api/v1/admin/app-stats  — mobile app usage stats
router.get('/app-stats', async (req, res) => {
  try {
    const PushToken = require('../models/PushToken');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today.getTime() - 7 * 86400000);

    const [
      totalBookings,
      todayBookings,
      weekBookings,
      activeTokens,
      bookingsByStatus,
      topRoutes,
    ] = await Promise.all([
      Booking.countDocuments(),
      Booking.countDocuments({ createdAt: { $gte: today } }),
      Booking.countDocuments({ createdAt: { $gte: weekAgo } }),
      PushToken.countDocuments({ isActive: true }),
      Booking.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { route: { $exists: true } } },
        { $group: { _id: '$route', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'routes', localField: '_id', foreignField: '_id', as: 'route' } },
        { $unwind: { path: '$route', preserveNullAndEmptyArrays: true } },
      ]),
    ]);

    res.json({
      success: true,
      stats: {
        totalBookings,
        todayBookings,
        weekBookings,
        activeDevices: activeTokens,
        bookingsByStatus: Object.fromEntries(bookingsByStatus.map(b => [b._id, b.count])),
        topRoutes: topRoutes.map(r => ({ name: r.route?.route_name || 'Unknown', count: r.count })),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
