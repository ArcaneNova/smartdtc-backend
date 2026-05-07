const Schedule = require('../models/Schedule');
const Bus      = require('../models/Bus');
const Driver   = require('../models/Driver');
const Route    = require('../models/Route');
const axios    = require('axios');

const AI_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000';

// GET /api/v1/schedule?date=&routeId=&status=&page=1&limit=30
exports.getSchedules = async (req, res) => {
  try {
    const { date, routeId, status, driverId, busId, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (routeId)  filter.route  = routeId;
    if (driverId) filter.driver = driverId;
    if (busId)    filter.bus    = busId;
    if (status)   filter.status = status;
    if (date) {
      const d = new Date(date);
      filter.date = { $gte: d, $lt: new Date(d.getTime() + 86400000) };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [schedules, total] = await Promise.all([
      Schedule.find(filter)
        .populate('route',  'route_name start_stage end_stage')
        .populate('bus',    'busNumber model type')
        .populate('driver', 'userId licenseNo')
        .sort({ departureTime: 1 })
        .skip(skip).limit(Number(limit)),
      Schedule.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), schedules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/schedule/:id
exports.getSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id)
      .populate('route').populate('bus').populate('driver');
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });
    res.json({ success: true, schedule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/schedule  (admin/dispatcher)
exports.createSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.create(req.body);
    res.status(201).json({ success: true, schedule });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/schedule/:id  (admin/dispatcher)
exports.updateSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });
    res.json({ success: true, schedule });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/v1/schedule/:id  (admin/dispatcher)
exports.deleteSchedule = async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) return res.status(404).json({ success: false, message: 'Schedule not found.' });
    res.json({ success: true, message: 'Schedule deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/schedule/bulk  (admin/dispatcher) — create many at once
exports.bulkCreateSchedule = async (req, res) => {
  try {
    const { schedules } = req.body; // array
    const created = await Schedule.insertMany(schedules, { ordered: false });
    res.status(201).json({ success: true, count: created.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/v1/schedule/generate-ai
// Calls the GA optimiser on the AI service for one or many routes
exports.generateAISchedule = async (req, res) => {
  try {
    const {
      date,
      routeIds        = [],
      totalBusesAvailable = 10,
      is_weekend      = false,
      is_holiday      = false,
      weather         = 'clear',
      start_hour      = 5,
      end_hour        = 23,
      turnaround_min  = 15,
      // trip_duration_min can be provided explicitly, otherwise computed from route distance
      trip_duration_min: explicitDuration,
    } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'date is required.' });
    if (!routeIds.length) return res.status(400).json({ success: false, message: 'routeIds[] is required.' });

    const busesPerRoute = Math.max(1, Math.floor(totalBusesAvailable / routeIds.length));

    // Fetch route details to compute trip duration if not supplied
    // avg city bus speed ~18 km/h, add stop dwell time buffer
    const routeMap = {};
    if (!explicitDuration && routeIds.length > 0) {
      const routes = await Route.find({ _id: { $in: routeIds } }).select('_id distance_km total_stages').lean();
      for (const r of routes) {
        const distKm = r.distance_km || 15;
        const stopDwell = (r.total_stages || 10) * 0.5; // ~30s dwell per stop in minutes
        routeMap[String(r._id)] = Math.round(distKm / 18 * 60 + stopDwell);
      }
    }

    // Call AI service for each route in parallel
    const results = await Promise.allSettled(
      routeIds.map(routeId => {
        const tripDuration = explicitDuration || routeMap[String(routeId)] || 90;
        return axios.post(`${AI_URL}/optimize/headway`, {
          route_id:          routeId,
          date,
          fleet_size:        busesPerRoute,
          trip_duration_min: tripDuration,
          turnaround_min,
          is_weekend,
          is_holiday,
          start_hour,
          end_hour,
        });
      })
    );

    const routeResults = results.map((r, i) => ({
      routeId:          routeIds[i],
      success:          r.status === 'fulfilled',
      slots:            r.status === 'fulfilled' ? (r.value.data.slots ?? [])            : [],
      waitScore:        r.status === 'fulfilled' ? r.value.data.total_wait_score        : null,
      total_trips:      r.status === 'fulfilled' ? r.value.data.total_trips             : null,
      cycle_time_min:   r.status === 'fulfilled' ? r.value.data.cycle_time_min          : null,
      min_headway_min:  r.status === 'fulfilled' ? r.value.data.min_headway_min         : null,
      trips_per_bus:    r.status === 'fulfilled' ? r.value.data.trips_per_bus           : null,
      trip_duration_min:r.status === 'fulfilled' ? r.value.data.trip_duration_min       : null,
      recommendations:  r.status === 'fulfilled' ? r.value.data.recommendations         : null,
      error:            r.status === 'rejected'  ? (r.reason?.response?.data?.detail ?? r.reason.message) : null,
    }));

    // For single-route request: expose top-level fields so frontend can read data.slots etc directly
    const singleRoute = routeIds.length === 1;
    const topLevel    = singleRoute ? {
      slots:             routeResults[0].slots,
      total_trips:       routeResults[0].total_trips,
      cycle_time_min:    routeResults[0].cycle_time_min,
      min_headway_min:   routeResults[0].min_headway_min,
      trips_per_bus:     routeResults[0].trips_per_bus,
      trip_duration_min: routeResults[0].trip_duration_min,
      recommendations:   routeResults[0].recommendations,
    } : { slots: [] };

    res.json({ success: true, date, schedules: routeResults, ...topLevel });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/schedule/generate-ai/apply
// Persists the AI-generated slots as Schedule documents
exports.applyAISchedule = async (req, res) => {
  try {
    const { date, routeId, slots = [], busId, driverId } = req.body;
    if (!date || !routeId || !slots.length) {
      return res.status(400).json({ success: false, message: 'date, routeId and slots[] are required.' });
    }

    const baseDate = new Date(date);
    const availableBuses = busId
      ? [{ _id: busId }]
      : await Bus.find({ status: { $in: ['active', 'idle'] } }).select('_id').lean();
    const availableDrivers = driverId
      ? [{ _id: driverId }]
      : await Driver.find({ status: { $in: ['on-duty', 'off-duty'] } }).select('_id').lean();

    if (!availableBuses.length) {
      return res.status(400).json({ success: false, message: 'No available buses found for AI schedule application.' });
    }
    if (!availableDrivers.length) {
      return res.status(400).json({ success: false, message: 'No available drivers found for AI schedule application.' });
    }

    const docs = slots.map((slot, index) => {
      // Accept both departure_min (from AI) and departureTime / time (ISO string)
      let dep;
      if (slot.departureTime) {
        dep = new Date(slot.departureTime);
      } else if (typeof slot.departure_min === 'number') {
        dep = new Date(baseDate);
        dep.setHours(0, 0, 0, 0);
        dep.setMinutes(slot.departure_min);
      } else if (slot.time) {
        dep = new Date(slot.time);
      } else {
        dep = new Date(baseDate);
      }

      const arrivalMs = dep.getTime() + (slot.duration_min ?? 90) * 60000;
      const arr = slot.estimatedArrivalTime ? new Date(slot.estimatedArrivalTime) : new Date(arrivalMs);

      return {
        route:                routeId,
        date:                 baseDate,
        departureTime:        dep,
        estimatedArrivalTime: arr,
        status:               'scheduled',
        generatedBy:          'ai-auto',
        crowdLevel:           slot.crowd_level || 'low',
        demand_score:         slot.demand_score ?? null,
        bus:                  availableBuses[index % availableBuses.length]._id,
        driver:               availableDrivers[index % availableDrivers.length]._id,
      };
    });

    const created = await Schedule.insertMany(docs, { ordered: false });
    res.status(201).json({ success: true, count: created.length });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// POST /api/v1/schedule/emergency – dispatch nearest idle bus to a route
exports.emergencyDispatch = async (req, res) => {
  try {
    const { routeId, reason } = req.body;
    if (!routeId) return res.status(400).json({ success: false, message: 'routeId is required.' });

    const Bus    = require('../models/Bus');
    const Alert  = require('../models/Alert');
    const Route  = require('../models/Route');

    // Find first idle bus
    const bus = await Bus.findOne({ status: { $in: ['idle', 'active'] } });
    if (!bus) return res.status(404).json({ success: false, message: 'No idle/active buses available.' });

    // Create emergency schedule for next 30 minutes
    const dep = new Date(Date.now() + 5 * 60000);   // departure in 5 min
    const arr = new Date(Date.now() + 95 * 60000);  // arrival in 95 min

    const schedule = await Schedule.create({
      route:                routeId,
      bus:                  bus._id,
      date:                 new Date(),
      departureTime:        dep,
      estimatedArrivalTime: arr,
      status:               'scheduled',
      generatedBy:          'emergency',
    });

    // Mark bus as in-service
    bus.status = 'in-service';
    await bus.save();

    // Create alert so dashboard shows the dispatch
    const route = await Route.findById(routeId).lean();
    await Alert.create({
      type:    'route-change',
      severity: 'warning',
      message: `🚌 Emergency dispatch: Bus ${bus.busNumber} deployed to Route ${route?.route_name ?? routeId}. ${reason ?? 'Overcrowding relief.'}`,
      route:   routeId,
      bus:     bus._id,
    });

    res.status(201).json({
      success: true,
      message: `Emergency bus ${bus.busNumber} dispatched to ${route?.route_name ?? routeId}`,
      schedule,
      bus: { busNumber: bus.busNumber, _id: bus._id },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

