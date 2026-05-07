/**
 * public.routes.js
 * No auth required — for passenger-facing website/app queries.
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const Razorpay = require('razorpay');
const Route   = require('../models/Route');
const Stage   = require('../models/Stage');
const Schedule= require('../models/Schedule');
const BusPosition = require('../models/BusPosition');
const Bus     = require('../models/Bus');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID     || 'rzp_test_placeholder',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'placeholder',
});

// GET /api/v1/public/search?from=&to=
router.get('/search', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from) return res.status(400).json({ success: false, message: '`from` stage name required.' });

    // Find routes that contain both `from` and `to` stages
    const fromStages = await Stage.find({ stage_name: { $regex: from, $options: 'i' } }).distinct('url_route_id');
    let filter = { url_route_id: { $in: fromStages }, isActive: true };

    if (to) {
      const toStages = await Stage.find({ stage_name: { $regex: to, $options: 'i' } }).distinct('url_route_id');
      filter.url_route_id.$in = fromStages.filter((id) => toStages.includes(id));
    }

    const routes = await Route.find(filter).limit(20);
    res.json({ success: true, routes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/public/route/:routeId/schedule?date=
router.get('/route/:routeId/schedule', async (req, res) => {
  try {
    const { date } = req.query;
    const d = date ? new Date(date) : new Date();
    d.setHours(0,0,0,0);

    const schedules = await Schedule.find({
      route:  req.params.routeId,
      date:   { $gte: d, $lt: new Date(d.getTime() + 86400000) },
      status: { $in: ['scheduled', 'in-progress'] },
    }).select('departureTime estimatedArrivalTime type status bus')
      .populate('bus', 'busNumber type')
      .sort({ departureTime: 1 });

    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/public/bus/:busId/live
router.get('/bus/:busId/live', async (req, res) => {
  try {
    const pos = await BusPosition.findOne({ bus: req.params.busId })
      .sort({ timestamp: -1 })
      .populate('nextStage', 'stage_name');
    res.json({ success: true, position: pos });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/public/fare?fromStage=&toStage=&busType=AC|non-AC|electric
router.get('/fare', async (req, res) => {
  try {
    const { fromStage, toStage, busType = 'non-AC', routeId } = req.query;

    // DTC fare slabs (approx, based on distance km)
    const slabs = [
      { maxKm: 2,   nonAC: 10, AC: 15, electric: 10 },
      { maxKm: 5,   nonAC: 15, AC: 20, electric: 15 },
      { maxKm: 10,  nonAC: 20, AC: 30, electric: 20 },
      { maxKm: 15,  nonAC: 25, AC: 40, electric: 25 },
      { maxKm: 20,  nonAC: 30, AC: 50, electric: 30 },
      { maxKm: 25,  nonAC: 35, AC: 60, electric: 35 },
      { maxKm: 30,  nonAC: 40, AC: 70, electric: 40 },
      { maxKm: 40,  nonAC: 50, AC: 85, electric: 50 },
      { maxKm: 999, nonAC: 60, AC: 100, electric: 60 },
    ];

    let distanceKm = 0;
    let fromName = fromStage || '';
    let toName = toStage || '';

    // If routeId given, get route distance
    if (routeId) {
      const route = await Route.findById(routeId, 'distance_km route_name start_stage end_stage');
      if (route) {
        distanceKm = route.distance_km || 0;
        fromName = fromName || route.start_stage;
        toName = toName || route.end_stage;
      }
    } else if (fromStage && toStage) {
      // Try to find matching route that has both stops
      const fromStages = await Stage.find({ stage_name: { $regex: fromStage, $options: 'i' } }).limit(5);
      const toStages   = await Stage.find({ stage_name: { $regex: toStage,   $options: 'i' } }).limit(5);

      if (fromStages.length && toStages.length) {
        // Estimate distance from seq difference
        const fromSeq = fromStages[0].seq || 1;
        const toSeq   = toStages[0].seq   || 10;
        const seqDiff = Math.abs(toSeq - fromSeq);
        distanceKm = Math.max(1, seqDiff * 1.5); // ~1.5 km per stop
        fromName = fromStages[0].stage_name;
        toName   = toStages[0].stage_name;
      }
    }

    // Look up fare slab
    const typeKey = busType === 'AC' ? 'AC' : busType === 'electric' ? 'electric' : 'nonAC';
    const slab = slabs.find(s => distanceKm <= s.maxKm) || slabs[slabs.length - 1];
    const fare = slab[typeKey];

    res.json({
      success: true,
      fare: {
        amount: fare,
        currency: 'INR',
        busType,
        distanceKm: Math.round(distanceKm * 10) / 10,
        from: fromName,
        to: toName,
        slabInfo: `Up to ${slab.maxKm} km`,
        concessionsAvailable: ['Senior Citizens (50%)', 'Students (25%)', 'Differently-abled (Free)'],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/public/stats — public stats for home page hero
router.get('/stats', async (req, res) => {
  try {
    const [totalRoutes, totalBuses, totalDrivers] = await Promise.all([
      Route.countDocuments({ isActive: true }),
      require('../models/Bus').countDocuments({ status: { $in: ['active', 'in-service'] } }),
      require('../models/Driver').countDocuments({ status: 'on-duty' }),
    ]);
    res.json({
      success: true,
      stats: {
        activeRoutes: totalRoutes,
        activeBuses: totalBuses,
        activeDrivers: totalDrivers,
        coverage: 'Delhi NCR',
        dailyPassengers: '3.5 Million+',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/public/alerts?limit=50  — unresolved alerts for passenger app
router.get('/alerts', async (req, res) => {
  try {
    const Alert = require('../models/Alert');
    const { limit = 50, severity } = req.query;
    const filter = { isResolved: false };
    if (severity) filter.severity = severity;
    const alerts = await Alert.find(filter)
      .populate('route', 'route_name')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();
    res.json({ success: true, alerts, count: alerts.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/public/scan-book/mobile-book  — auth required, no payment gateway (cash/demo)
// Used by mobile app for on-board cash/demo payments
router.post('/scan-book/mobile-book', protect, async (req, res) => {
  try {
    const { busQrId, scheduleId, dropStageId, dropStageName, fare, passengers = 1 } = req.body;
    if (!busQrId || !dropStageName || !fare)
      return res.status(400).json({ success: false, message: 'busQrId, dropStageName, and fare are required.' });

    const bus = await Bus.findOne({ busQrId });
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });

    // Auto seat assignment
    const seatLayout = ['W', 'A', 'A', 'W'];
    let bookedSeats = [];
    if (scheduleId) {
      const existing = await Booking.find({ schedule: scheduleId, status: { $in: ['confirmed', 'boarded'] } });
      bookedSeats = existing.flatMap(b => b.seatNumbers || []);
    }
    const seats = [];
    outer: for (let row = 1; row <= Math.ceil(bus.capacity / 4); row++) {
      for (let col = 0; col < 4; col++) {
        const label = `${row}${seatLayout[col]}`;
        if (!bookedSeats.includes(label)) {
          seats.push(label);
          if (seats.length === Number(passengers)) break outer;
        }
      }
    }

    const booking = await Booking.create({
      user:        req.user._id,
      bus:         bus._id,
      schedule:    scheduleId || undefined,
      toStop:      dropStageName,
      dropStop:    dropStageName,
      fare:        fare * passengers,
      seatNumbers: seats,
      passengers:  passengers,
      status:      'confirmed',
      paymentMode: 'cash',
      bookedAt:    new Date(),
      expiresAt:   new Date(Date.now() + 90 * 60 * 1000),
    });

    res.json({
      success: true,
      booking: {
        _id:         booking._id,
        bookingRef:  booking.bookingRef,
        seatNumbers: booking.seatNumbers,
        toStop:      booking.toStop,
        fare:        booking.fare,
        status:      booking.status,
        expiresAt:   booking.expiresAt,
        busNumber:   bus.busNumber,
        busType:     bus.type,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── SCAN-TO-BOARD ─────────────────────────────────────────────────────────

// GET /api/v1/public/bus-scan/:busQrId  — no auth, called when passenger scans gate QR
router.get('/bus-scan/:busQrId', async (req, res) => {
  try {
    const bus = await Bus.findOne({ busQrId: req.params.busQrId })
      .populate('currentRoute', 'route_name url_route_id start_stage end_stage distance_km')
      .lean();
    if (!bus) return res.status(404).json({ success: false, message: 'Bus QR not found.' });

    // Active schedule for this bus today
    const today = new Date(); today.setHours(0,0,0,0);
    const schedule = await Schedule.findOne({
      bus: bus._id,
      date: { $gte: today, $lt: new Date(today.getTime() + 86400000) },
      status: { $in: ['scheduled', 'in-progress'] },
    }).populate('route', 'route_name url_route_id start_stage end_stage').lean();

    // Stages for the route
    let stages = [];
    const routeId = (schedule?.route?.url_route_id) || (bus.currentRoute?.url_route_id);
    if (routeId) {
      stages = await Stage.find({ url_route_id: routeId }).sort({ seq: 1 }).lean();
    }

    // Live position
    const position = await BusPosition.findOne({ bus: bus._id })
      .sort({ timestamp: -1 }).populate('nextStage', 'stage_name seq').lean();

    // Fare slabs
    const slabs = [
      { maxKm: 2,   nonAC: 10, AC: 15, electric: 10 },
      { maxKm: 5,   nonAC: 15, AC: 20, electric: 15 },
      { maxKm: 10,  nonAC: 20, AC: 30, electric: 20 },
      { maxKm: 15,  nonAC: 25, AC: 40, electric: 25 },
      { maxKm: 20,  nonAC: 30, AC: 50, electric: 30 },
      { maxKm: 25,  nonAC: 35, AC: 60, electric: 35 },
      { maxKm: 30,  nonAC: 40, AC: 70, electric: 40 },
      { maxKm: 40,  nonAC: 50, AC: 85, electric: 50 },
      { maxKm: 999, nonAC: 60, AC: 100, electric: 60 },
    ];
    const typeKey = bus.type === 'AC' ? 'AC' : bus.type === 'Electric' ? 'electric' : 'nonAC';
    // Attach per-stage fare (from current position onward)
    const currentSeq = position?.nextStage?.seq || 0;
    const stagesWithFare = stages.map((s, idx) => {
      const seqDiff = Math.max(0, s.seq - currentSeq);
      const km = Math.max(1, seqDiff * 1.5);
      const slab = slabs.find(sl => km <= sl.maxKm) || slabs[slabs.length - 1];
      return { ...s, fareFromHere: slab[typeKey], distanceKm: Math.round(km * 10) / 10 };
    });

    res.json({
      success: true,
      bus: {
        _id: bus._id,
        busNumber: bus.busNumber,
        busQrId: bus.busQrId,
        type: bus.type,
        capacity: bus.capacity,
      },
      route: schedule?.route || bus.currentRoute || null,
      schedule: schedule ? {
        _id: schedule._id,
        departureTime: schedule.departureTime,
        status: schedule.status,
        type: schedule.type,
      } : null,
      currentStop: position?.nextStage?.stage_name || null,
      stages: stagesWithFare,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/public/scan-book/create-order  — auth required
// Body: { busQrId, scheduleId, dropStageId, dropStageName, fare, passengers:1 }
router.post('/scan-book/create-order', protect, async (req, res) => {
  try {
    const { busQrId, scheduleId, dropStageId, dropStageName, fare, passengers = 1 } = req.body;
    if (!busQrId || !dropStageName || !fare)
      return res.status(400).json({ success: false, message: 'busQrId, dropStageName, and fare are required.' });

    const bus = await Bus.findOne({ busQrId });
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });

    const totalAmount = Math.round(fare * passengers); // INR

    const order = await razorpay.orders.create({
      amount: totalAmount * 100, // paise
      currency: 'INR',
      receipt: `stb_${Date.now()}`,
      notes: {
        userId: req.user._id.toString(),
        busId:  bus._id.toString(),
        busQrId,
        scheduleId: scheduleId || '',
        dropStageId: dropStageId || '',
        dropStageName,
        passengers: String(passengers),
        fare: String(fare),
      },
    });

    res.json({ success: true, order: { id: order.id, amount: order.amount, currency: order.currency } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/public/scan-book/verify-payment  — auth required
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, busQrId, scheduleId, dropStageName, fare, passengers }
router.post('/scan-book/verify-payment', protect, async (req, res) => {
  try {
    const {
      razorpay_order_id, razorpay_payment_id, razorpay_signature,
      busQrId, scheduleId, dropStageName, fare, passengers = 1,
    } = req.body;

    // Verify Razorpay signature
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'placeholder')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expected !== razorpay_signature)
      return res.status(400).json({ success: false, message: 'Payment verification failed.' });

    const bus = await Bus.findOne({ busQrId });
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });

    // Assign seats
    const seatLayout = ['W', 'A', 'A', 'W'];
    let bookedSeats = [];
    if (scheduleId) {
      const existing = await Booking.find({ schedule: scheduleId, status: { $in: ['confirmed','boarded'] } });
      bookedSeats = existing.flatMap(b => b.seatNumbers || []);
    }
    const assignSeats = (count) => {
      const seats = [];
      for (let row = 1; row <= Math.ceil(bus.capacity / 4); row++) {
        for (let col = 0; col < 4; col++) {
          const label = `${row}${seatLayout[col]}`;
          if (!bookedSeats.includes(label) && !seats.includes(label)) {
            seats.push(label);
            if (seats.length === count) return seats;
          }
        }
      }
      return seats;
    };
    const seatNumbers = assignSeats(Number(passengers));

    const booking = await Booking.create({
      user:        req.user._id,
      bus:         bus._id,
      schedule:    scheduleId || undefined,
      toStop:      dropStageName,
      fare:        fare * passengers,
      seatNumbers,
      passengers:  passengers,
      status:      'confirmed',
      paymentId:   razorpay_payment_id,
      paymentMode: 'online',
      bookedAt:    new Date(),
      // 90-minute scan-to-board ticket validity
      expiresAt:   new Date(Date.now() + 90 * 60 * 1000),
    });

    res.json({
      success: true,
      booking: {
        _id:          booking._id,
        bookingRef:   booking.bookingRef,
        seatNumbers:  booking.seatNumbers,
        toStop:       booking.toStop,
        fare:         booking.fare,
        status:       booking.status,
        expiresAt:    booking.expiresAt,
        busNumber:    bus.busNumber,
        busType:      bus.type,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

