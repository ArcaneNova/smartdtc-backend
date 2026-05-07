/**
 * mobile.routes.js
 * Routes for Driver & Passenger mobile apps (grouped under /api/v1/mobile)
 */

const express    = require('express');
const router     = express.Router();
const axios      = require('axios');
const Schedule   = require('../models/Schedule');
const TripHistory= require('../models/TripHistory');
const BusPosition= require('../models/BusPosition');
const Favourite  = require('../models/Favourite');
const PushToken  = require('../models/PushToken');
const Driver     = require('../models/Driver');
const Booking    = require('../models/Booking');
const { protect, authorize } = require('../middleware/auth');

const AI_URL = process.env.AI_SERVICE_URL || process.env.PYTHON_AI_URL || 'http://localhost:8000';

router.use(protect);

// ── DRIVER ROUTES ─────────────────────────────────────────────────────────

// GET /api/v1/mobile/driver/dashboard
router.get('/driver/dashboard', authorize('driver'), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id })
      .populate('assignedBus');
    if (!driver) return res.status(404).json({ success: false, message: 'Driver profile not found.' });

    const today = new Date(); today.setHours(0,0,0,0);
    const tmrw  = new Date(today.getTime() + 86400000);

    const todayTrips = await Schedule.countDocuments({ driver: driver._id, date: { $gte: today, $lt: tmrw } });
    const completedTrips = await Schedule.countDocuments({ driver: driver._id, date: { $gte: today, $lt: tmrw }, status: 'completed' });

    res.json({ success: true, driver, assignedBus: driver.assignedBus || null, todayTrips, completedTrips });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/driver/profile
router.get('/driver/profile', authorize('driver'), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id }).populate('assignedBus', 'busNumber model');
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/mobile/driver/status
router.patch('/driver/status', authorize('driver'), async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['on-duty', 'off-duty', 'on-leave'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    const driver = await Driver.findOneAndUpdate({ userId: req.user._id }, { status }, { new: true });
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/driver/schedule/today
router.get('/driver/schedule/today', authorize('driver'), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });

    const today = new Date(); today.setHours(0,0,0,0);
    const tmrw  = new Date(today.getTime() + 86400000);

    const schedules = await Schedule.find({ driver: driver._id, date: { $gte: today, $lt: tmrw } })
      .populate('route', 'route_name start_stage end_stage')
      .populate('bus', 'busNumber')
      .sort({ departureTime: 1 });

    const current = schedules.find(s => s.status === 'in-progress') ||
                    schedules.find(s => s.status === 'scheduled') || null;

    res.json({ success: true, schedules, current });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/driver/schedule/range?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/driver/schedule/range', authorize('driver'), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });

    const { from, to } = req.query;
    const fromDate = from ? new Date(from) : new Date();
    fromDate.setHours(0, 0, 0, 0);
    const toDate = to ? new Date(to) : new Date(fromDate.getTime() + 7 * 86400000);
    toDate.setHours(23, 59, 59, 999);

    const schedules = await Schedule.find({
      driver: driver._id,
      date: { $gte: fromDate, $lte: toDate },
    })
      .populate('route', 'route_name start_stage end_stage')
      .populate('bus', 'busNumber model type')
      .sort({ date: 1, departureTime: 1 });

    res.json({ success: true, schedules, count: schedules.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/driver/schedule/active
router.get('/driver/schedule/active', authorize('driver'), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });

    const schedule = await Schedule.findOne({ driver: driver._id, status: 'in-progress' })
      .populate('route', '_id route_name')
      .populate('bus', '_id busNumber');

    res.json({ success: true, schedule: schedule || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/driver/schedule  — all schedules for logged-in driver
router.get('/driver/schedule', authorize('driver'), async (req, res) => {
  try {
    console.log('[DRIVER SCHEDULE] Request from user:', req.user._id, 'email:', req.user.email);
    const driver = await Driver.findOne({ userId: req.user._id });
    console.log('[DRIVER SCHEDULE] Driver found:', driver ? `${driver._id} (licenseNo: ${driver.licenseNo})` : 'NOT FOUND');
    if (!driver) {
      console.log('[DRIVER SCHEDULE] ERROR: No Driver profile for this user');
      return res.status(404).json({ success: false, message: 'Driver profile not found.' });
    }

    const today = new Date(); today.setHours(0,0,0,0);
    const tmrw  = new Date(today.getTime() + 86400000);

    console.log('[DRIVER SCHEDULE] Query params - driver:', driver._id, 'today:', today, 'tmrw:', tmrw);

    const schedules = await Schedule.find({
      driver: driver._id,
      date:   { $gte: today, $lt: tmrw },
    }).populate('route', 'route_name start_stage end_stage')
      .populate('bus',   'busNumber model type')
      .sort({ departureTime: 1 });

    console.log('[DRIVER SCHEDULE] Found schedules:', schedules.length);
    schedules.forEach((s, i) => console.log(`  [${i}]`, s._id, 'route:', s.route?.route_name, 'bus:', s.bus?.busNumber, 'time:', s.departureTime));
    res.json({ success: true, schedules });
  } catch (err) {
    console.error('[DRIVER SCHEDULE ERROR]', err.message, err.stack);
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/mobile/driver/trip/start
router.post('/driver/trip/start', authorize('driver'), async (req, res) => {
  try {
    const { scheduleId } = req.body;
    const schedule = await Schedule.findByIdAndUpdate(scheduleId, { status: 'in-progress' }, { new: true });
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

    const trip = await TripHistory.create({
      driver:    (await Driver.findOne({ userId: req.user._id }))._id,
      bus:       schedule.bus,
      route:     schedule.route,
      schedule:  schedule._id,
      startTime: new Date(),
      totalStops:0,
    });

    res.status(201).json({ success: true, trip, schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/mobile/driver/trip/end
router.post('/driver/trip/end', authorize('driver'), async (req, res) => {
  try {
    const { tripId, stopsCompleted, distanceCovered, avgSpeed, incidents, passengerCount } = req.body;

    // Calculate fare via AI service based on distance covered
    let fareAmount = 0;
    if (distanceCovered > 0) {
      try {
        const busInfo = await TripHistory.findById(tripId).populate('bus', 'type');
        const busType = busInfo?.bus?.type || 'non-AC';
        const { data: fareData } = await axios.post(`${AI_URL}/predict/fare`, {
          distance_km: distanceCovered,
          bus_type:    busType === 'AC' ? 'AC' : busType === 'Electric' ? 'electric' : 'non-AC',
        }, { timeout: 5000 });
        fareAmount = (fareData.amount || 0) * (passengerCount || 1);
      } catch { /* fallback: ₹20 base */ fareAmount = 20 * (passengerCount || 1); }
    }

    const trip = await TripHistory.findByIdAndUpdate(tripId, {
      endTime:          new Date(),
      status:           'completed',
      stopsCompleted:   stopsCompleted   || 0,
      distanceCovered:  distanceCovered  || 0,
      avgSpeed:         avgSpeed         || 0,
      incidents:        incidents        || [],
      passengerCount:   passengerCount   || 0,
      fare:             fareAmount,
      onTimeStatus:     (req.body.delayMinutes || 0) <= 5 ? 'on-time' : 'delayed',
      delayMinutes:     req.body.delayMinutes || 0,
    }, { new: true });

    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });

    await Schedule.findByIdAndUpdate(trip.schedule, { status: 'completed' });
    res.json({ success: true, trip, fareCalculated: fareAmount });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── SHARED FAVOURITES (used by mobile app) ────────────────────────────────

// GET /api/v1/mobile/favourites
router.get('/favourites', async (req, res) => {
  try {
    const favs = await Favourite.find({ user: req.user._id }).populate('refId').sort({ createdAt: -1 });
    res.json({ success: true, data: favs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/mobile/favourites
router.post('/favourites', async (req, res) => {
  try {
    const { refId, refModel } = req.body;
    if (!refId || !refModel) return res.status(400).json({ success: false, message: 'refId and refModel required' });
    const existing = await Favourite.findOne({ user: req.user._id, refId });
    if (existing) return res.json({ success: true, data: existing, message: 'Already in favourites' });
    const fav = await Favourite.create({ user: req.user._id, refId, refModel });
    res.status(201).json({ success: true, data: fav });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/v1/mobile/favourites/:refId
router.delete('/favourites/:refId', async (req, res) => {
  try {
    await Favourite.findOneAndDelete({ user: req.user._id, refId: req.params.refId });
    res.json({ success: true, message: 'Removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PASSENGER ROUTES ──────────────────────────────────────────────────────

// GET /api/v1/mobile/passenger/stats
router.get('/passenger/stats', async (req, res) => {
  try {
    const favouritesCount = await Favourite.countDocuments({ user: req.user._id });
    res.json({ success: true, favouritesCount, tripsCount: 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/passenger/favourites
router.get('/passenger/favourites', async (req, res) => {
  try {
    const favs = await Favourite.find({ user: req.user._id });
    res.json({ success: true, favourites: favs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/mobile/passenger/favourites
router.post('/passenger/favourites', async (req, res) => {
  try {
    const { type, refId, label } = req.body;
    const refModel = type === 'route' ? 'Route' : 'Stage';
    const fav = await Favourite.create({ user: req.user._id, type, refId, refModel, label });
    res.status(201).json({ success: true, favourite: fav });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/v1/mobile/passenger/favourites/:id
router.delete('/passenger/favourites/:id', async (req, res) => {
  try {
    await Favourite.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── TRIP RATING ───────────────────────────────────────────────────────────

// POST /api/v1/mobile/passenger/booking
router.post('/passenger/booking', async (req, res) => {
  try {
    const { routeId, scheduleId, passengers, boardingStop, dropStop, seatPreference, bookingRef } = req.body;
    const requestedPax = Number(passengers) || 1;

    // ── Capacity & seat-assignment ─────────────────────────────────────────
    let assignedSeats = [];
    if (scheduleId) {
      const schedule = await Schedule.findById(scheduleId).populate('bus');
      if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });

      const busCapacity = schedule.bus?.capacity || 60;

      // All seats currently taken for this schedule
      const existingBookings = await Booking.find({
        schedule: scheduleId,
        status:   { $in: ['confirmed', 'boarded'] },
      }).select('seatNumbers passengers');

      const takenSeats = new Set(existingBookings.flatMap(b => b.seatNumbers || []));

      if (takenSeats.size + requestedPax > busCapacity) {
        const available = busCapacity - takenSeats.size;
        return res.status(400).json({
          success:   false,
          message:   available <= 0
            ? 'This bus is fully booked.'
            : `Only ${available} seat(s) remaining. Requested ${requestedPax}.`,
          available,
        });
      }

      // Build seat pools by preference (4-across rows: W-A-A-W per row)
      const allSeats     = Array.from({ length: busCapacity }, (_, i) => String(i + 1));
      const windowSeats  = allSeats.filter((_, i) => i % 4 === 0 || i % 4 === 3);
      const aisleSeats   = allSeats.filter((_, i) => i % 4 === 1 || i % 4 === 2);

      let pool;
      if (seatPreference === 'window') {
        const avWin = windowSeats.filter(s => !takenSeats.has(s));
        pool = avWin.length >= requestedPax ? avWin : allSeats.filter(s => !takenSeats.has(s));
      } else if (seatPreference === 'aisle') {
        const avAisle = aisleSeats.filter(s => !takenSeats.has(s));
        pool = avAisle.length >= requestedPax ? avAisle : allSeats.filter(s => !takenSeats.has(s));
      } else {
        pool = allSeats.filter(s => !takenSeats.has(s));
      }

      assignedSeats = pool.slice(0, requestedPax);
    }

    const booking = await Booking.create({
      user:           req.user._id,
      route:          routeId    || undefined,
      schedule:       scheduleId || undefined,
      bookingRef:     bookingRef || `DTC-${Date.now().toString(36).toUpperCase().slice(-6)}`,
      passengers:     requestedPax,
      boardingStop:   boardingStop || '',
      dropStop:       dropStop     || '',
      seatPreference: seatPreference || 'any',
      seatNumbers:    assignedSeats,
      status:         'confirmed',
    });
    res.status(201).json({ success: true, booking });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/passenger/bookings
router.get('/passenger/bookings', async (req, res) => {
  try {
    const { limit = 50, page = 1, status } = req.query;
    const filter = { user: req.user._id };
    if (status && status !== 'all') filter.status = status;

    const bookings = await Booking.find(filter)
      .populate('route', 'route_name start_stage end_stage')
      .populate('schedule', 'departureTime arrivalTime date')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    const formatted = bookings.map(b => ({
      _id:            b._id,
      bookingRef:     b.bookingRef,
      routeName:      b.route ? b.route.route_name : null,
      startStage:     b.route ? b.route.start_stage : null,
      endStage:       b.route ? b.route.end_stage : null,
      departureTime:  b.schedule ? b.schedule.departureTime : null,
      arrivalTime:    b.schedule ? b.schedule.arrivalTime : null,
      scheduleDate:   b.schedule ? b.schedule.date : null,
      passengers:     b.passengers,
      boardingStop:   b.boardingStop,
      dropStop:       b.dropStop,
      seatPreference: b.seatPreference,
      seatNumbers:    b.seatNumbers || [],
      status:         b.status,
      fare:           b.fare,
      createdAt:      b.createdAt,
    }));

    const total = await Booking.countDocuments(filter);
    res.json({ success: true, bookings: formatted, total });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PATCH /api/v1/mobile/bookings/:id  — passenger cancel, driver mark boarded/completed
router.patch('/bookings/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const ALLOWED = ['confirmed', 'boarded', 'cancelled', 'completed'];
    if (!status || !ALLOWED.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${ALLOWED.join(', ')}` });
    }
    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).populate('user', 'name email').populate('route', 'route_name');
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/mobile/driver/verify-qr  — driver scans passenger QR to verify + mark boarded
router.post('/driver/verify-qr', authorize('driver'), async (req, res) => {
  try {
    const { bookingRef } = req.body;
    if (!bookingRef) return res.status(400).json({ success: false, message: 'bookingRef is required.' });

    const booking = await Booking.findOne({ bookingRef })
      .populate('user',     'name email phone')
      .populate('route',    'route_name start_stage end_stage')
      .populate('schedule', 'departureTime arrivalTime date bus')
      .lean();

    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found. Invalid QR.' });

    if (booking.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This booking has been cancelled.', booking });
    }
    if (booking.status === 'boarded' || booking.status === 'completed') {
      return res.status(200).json({
        success: true,
        alreadyBoarded: true,
        message: `Passenger already ${booking.status}.`,
        booking,
      });
    }

    // Mark as boarded
    await Booking.findByIdAndUpdate(booking._id, { status: 'boarded' });

    res.json({
      success:       true,
      alreadyBoarded: false,
      message:       'Passenger verified and marked as boarded ✅',
      booking:       { ...booking, status: 'boarded' },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/driver/passengers?scheduleId=...
router.get('/driver/passengers', authorize('driver'), async (req, res) => {
  try {
    const { scheduleId } = req.query;
    const filter = {};
    if (scheduleId) filter.schedule = scheduleId;
    const bookings = await Booking.find(filter)
      .populate('user', 'name email phone')
      .populate('route', 'route_name')
      .sort({ createdAt: 1 });
    res.json({ success: true, bookings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


router.post('/trips/:tripId/rating', async (req, res) => {
  try {
    const { overallRating, driverRating, comfortRating, tags, comment } = req.body;

    if (!overallRating || overallRating < 1 || overallRating > 5) {
      return res.status(400).json({ success: false, message: 'overallRating (1-5) is required.' });
    }

    const trip = await TripHistory.findByIdAndUpdate(
      req.params.tripId,
      {
        $set: {
          rating: {
            overall:  overallRating,
            driver:   driverRating  || null,
            comfort:  comfortRating || null,
            tags:     tags          || [],
            comment:  comment       || '',
            ratedBy:  req.user._id,
            ratedAt:  new Date(),
          },
        },
      },
      { new: true }
    );

    if (!trip) {
      return res.status(404).json({ success: false, message: 'Trip not found.' });
    }

    // Update driver's average rating
    if (trip.driver && driverRating) {
      const Driver2 = require('../models/Driver');
      const allRatings = await TripHistory.find(
        { driver: trip.driver, 'rating.driver': { $exists: true, $ne: null } },
        { 'rating.driver': 1 }
      );
      const avg = allRatings.reduce((s, t) => s + (t.rating?.driver || 0), 0) / (allRatings.length || 1);
      await Driver2.findByIdAndUpdate(trip.driver, { rating: Math.round(avg * 10) / 10 });
    }

    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/mobile/trips/:tripId — get trip detail for rating screen
router.get('/trips/:tripId', async (req, res) => {
  try {
    const trip = await TripHistory.findById(req.params.tripId)
      .populate('route', 'route_name')
      .populate('bus',   'busNumber')
      .populate('driver');
    if (!trip) return res.status(404).json({ success: false, message: 'Trip not found.' });
    res.json({ success: true, trip });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DRIVER PERFORMANCE / EARNINGS ──────────────────────────────────────────

// GET /api/v1/mobile/driver/performance
// Called from (driver)/earnings.tsx
router.get('/driver/performance', authorize('driver'), async (req, res) => {
  try {
    const driver = await Driver.findOne({ userId: req.user._id });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver profile not found.' });

    const now   = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart  = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [daily, weekly, monthly] = await Promise.all([
      TripHistory.find({ driver: driver._id, startTime: { $gte: today } }),
      TripHistory.find({ driver: driver._id, startTime: { $gte: weekStart } }),
      TripHistory.find({ driver: driver._id, startTime: { $gte: monthStart } }),
    ]);

    const calcStats = (trips) => {
      const completed = trips.filter(t => t.status === 'completed');
      const totalPassengers = completed.reduce((s, t) => s + (t.passengerCount || 0), 0);
      const totalFare       = completed.reduce((s, t) => s + (t.fare || 0), 0);
      const totalDist       = completed.reduce((s, t) => s + (t.distanceCovered || 0), 0);
      const totalDelay      = completed.reduce((s, t) => s + (t.delayMinutes || 0), 0);
      const onTimeTrips     = completed.filter(t => (t.delayMinutes || 0) <= 5).length;
      const onTimePct       = completed.length > 0 ? Math.round((onTimeTrips / completed.length) * 100) : 100;

      const ratings = completed.filter(t => t.rating?.overall).map(t => t.rating.overall);
      const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null;

      return {
        trips:       completed.length,
        passengers:  totalPassengers,
        fareEarned:  totalFare,
        distanceKm:  Math.round(totalDist * 10) / 10,
        avgDelayMin: completed.length ? Math.round(totalDelay / completed.length) : 0,
        onTimePct,
        avgRating:   avgRating ? parseFloat(avgRating) : driver.rating || 4.5,
      };
    };

    // 7-day rating trend
    const ratingTrend = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const dEnd = new Date(d); dEnd.setDate(d.getDate() + 1);
      const dayTrips = await TripHistory.find({
        driver: driver._id,
        startTime: { $gte: d, $lt: dEnd },
        'rating.overall': { $exists: true },
      });
      const avg = dayTrips.length
        ? dayTrips.reduce((s, t) => s + (t.rating?.overall || 0), 0) / dayTrips.length
        : null;
      ratingTrend.push({ date: d.toISOString().slice(0, 10), rating: avg ? parseFloat(avg.toFixed(1)) : null });
    }

    // Rank calculation based on monthly completed trips
    const monthlyTrips = monthly.filter(t => t.status === 'completed').length;
    let rank = 'Bronze';
    if (monthlyTrips >= 120) rank = 'Platinum';
    else if (monthlyTrips >= 80) rank = 'Gold';
    else if (monthlyTrips >= 40) rank = 'Silver';

    res.json({
      success: true,
      driver: {
        name:   req.user.name,
        rating: driver.rating || 4.5,
        rank,
        licenseNo: driver.licenseNo,
      },
      stats: {
        daily:   calcStats(daily),
        weekly:  calcStats(weekly),
        monthly: calcStats(monthly),
      },
      ratingTrend,
      totalCompletedTrips: await TripHistory.countDocuments({ driver: driver._id, status: 'completed' }),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── AI PROXY ──────────────────────────────────────────────────────────────────

// POST /api/v1/mobile/ai/eta  — proxy to AI service for mobile app
router.post('/ai/eta', async (req, res) => {
  try {
    const { data } = await axios.post(`${AI_URL}/predict/eta`, req.body, { timeout: 8000 });
    res.json({ success: true, ...data });
  } catch (err) {
    // Fallback: simple haversine-based ETA
    const dist = req.body.distance_km || 5;
    const speed = req.body.avg_speed_kmh || 20;
    res.json({
      success:        true,
      eta_minutes:    Math.round((dist / speed) * 60),
      eta_confidence: 0.7,
      model:          'fallback',
      breakdown:      { distance_km: dist, speed_kmh: speed },
    });
  }
});

// POST /api/v1/mobile/ai/demand  — proxy for demand prediction
router.post('/ai/demand', async (req, res) => {
  try {
    const { data } = await axios.post(`${AI_URL}/predict/demand`, req.body, { timeout: 8000 });
    res.json({ success: true, ...data });
  } catch (err) {
    res.json({ success: true, predicted_count: 50, crowd_level: 'medium', model: 'fallback' });
  }
});

// POST /api/v1/mobile/ai/delay  — proxy for delay prediction
router.post('/ai/delay', async (req, res) => {
  try {
    const { data } = await axios.post(`${AI_URL}/predict/delay`, req.body, { timeout: 8000 });
    res.json({ success: true, ...data });
  } catch (err) {
    res.json({ success: true, predicted_delay_minutes: 3, model: 'fallback' });
  }
});

// ── SHARED — PUSH TOKEN ───────────────────────────────────────────────────

// POST /api/v1/mobile/push-token
router.post('/push-token', async (req, res) => {
  try {
    const { expoPushToken, platform } = req.body;
    const token = await PushToken.findOneAndUpdate(
      { expoPushToken },
      { user: req.user._id, expoPushToken, platform, isActive: true },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, token });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
