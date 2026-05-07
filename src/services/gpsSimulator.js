/**
 * gpsSimulator.js — Enhanced SmartDTC GPS Simulator
 * Simulates 16 active buses moving along real DTC route stage coordinates.
 * - Runs on a 5-second interval
 * - Realistic speed variation (peak vs off-peak hours)
 * - Delay detection + automatic alert generation
 * - Anomaly detection via AI service → auto-generates critical alerts
 * - Emits Socket.io events: bus:location_update, alert:new, anomaly:detected
 */

const axios       = require('axios');
const Bus         = require('../models/Bus');
const Stage       = require('../models/Stage');
const BusPosition = require('../models/BusPosition');
const Alert       = require('../models/Alert');
const Booking     = require('../models/Booking');
const Schedule    = require('../models/Schedule');
const { getIO }   = require('../config/socket');

const AI_URL = process.env.AI_SERVICE_URL || process.env.PYTHON_AI_URL || 'http://localhost:8000';

// In-memory state: busId → { idx, stages, delayMin, alertedDelay, alertedAnomaly, passengerLoad }
// passengerLoad cache refreshes every 5 minutes per bus
const _loadCache = {}; // busId → { load, fetchedAt }
const LOAD_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get real passenger load % for a bus from active bookings.
 * Falls back to a peak-hour-aware estimate if no schedule found.
 */
async function getPassengerLoad(bus) {
  const busIdStr = String(bus._id);
  const cached   = _loadCache[busIdStr];
  if (cached && (Date.now() - cached.fetchedAt) < LOAD_CACHE_TTL) {
    return cached.load;
  }

  try {
    // Find the active/in-progress schedule for this bus
    const schedule = await Schedule.findOne({
      bus:    bus._id,
      status: 'in-progress',
    }).select('_id bus').lean();

    if (schedule) {
      const capacity = bus.capacity || 60;
      const [confirmed, boarded] = await Promise.all([
        Booking.countDocuments({ schedule: schedule._id, status: 'confirmed' }),
        Booking.countDocuments({ schedule: schedule._id, status: 'boarded' }),
      ]);
      const load = Math.min(100, Math.round(((confirmed + boarded) / capacity) * 100));
      _loadCache[busIdStr] = { load, fetchedAt: Date.now() };
      return load;
    }
  } catch { /* fall through to estimate */ }

  // Realistic estimate: peak hours have higher load
  const h = new Date().getHours();
  const isPeak = (h >= 7 && h <= 10) || (h >= 17 && h <= 20);
  const load = isPeak
    ? 55 + Math.floor(Math.random() * 35)   // 55–90% at peak
    : 15 + Math.floor(Math.random() * 40);  // 15–55% off-peak
  _loadCache[busIdStr] = { load, fetchedAt: Date.now() };
  return load;
}
const simState = {};
let   simInterval = null;
let   isRunning   = false;

// ── Helpers ──────────────────────────────────────────────────────────────────
function peakHour() {
  const h = new Date().getHours();
  return (h >= 7 && h <= 10) || (h >= 17 && h <= 20);
}

function getSpeed() {
  if (peakHour()) return 15 + Math.floor(Math.random() * 15); // 15-30 km/h
  return 30 + Math.floor(Math.random() * 20);                 // 30-50 km/h
}

function interpolate(a, b, t) {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// ── Single bus tick ───────────────────────────────────────────────────────────
async function tickBus(bus) {
  try {
    const state = simState[String(bus._id)];
    if (!state || !state.stages || !state.stages.length) return;

    const stages = state.stages;
    const idx    = state.idx;

    // Interpolate between current and next stage
    const cur   = stages[idx];
    const nxt   = stages[(idx + 1) % stages.length];
    const t     = state.t || 0;

    const pos   = interpolate(cur, nxt, t);
    const speed = getSpeed();

    // Vary delay: slight random drift
    state.delayMin = Math.max(0, state.delayMin + (Math.random() < 0.3 ? 1 : -0.5));
    state.delayMin = Math.round(Math.min(state.delayMin, 25));

    const delay = state.delayMin;

    // Fetch real passenger load (cached 5 min)
    const passengerLoad = await getPassengerLoad(bus);

    // Save to BusPosition
    await BusPosition.create({
      bus:            bus._id,
      route:          bus.currentRoute?._id || bus.currentRoute,
      location:       { type: 'Point', coordinates: [pos.lng, pos.lat] },
      speed,
      heading:        Math.floor(Math.random() * 360),
      nextStage:      nxt._id,
      etaNextStage:   new Date(Date.now() + delay * 60000),
      delay_minutes:  delay,
      passenger_load: passengerLoad,
      isSimulated:    true,
      timestamp:      new Date(),
    });

    // Update Bus.lastPosition
    await Bus.findByIdAndUpdate(bus._id, {
      lastPosition: { lat: pos.lat, lng: pos.lng, speed, timestamp: new Date() },
    });

    // ── Emit Socket.io ──
    const io = getIO();
    const payload = {
      _id:            String(bus._id),
      bus:            String(bus._id),
      busId:          String(bus._id),
      busNumber:      bus.busNumber,
      lat:            pos.lat,
      lng:            pos.lng,
      speed,
      delay_minutes:  delay,
      delay,
      passenger_load: passengerLoad,
      nextStage:      nxt.stage_name,
      nextStageId:    String(nxt._id),
      routeId:        String(bus.currentRoute?._id || bus.currentRoute || ''),
      routeName:      bus.currentRoute?.route_name || '',
      timestamp:      new Date().toISOString(),
    };

    io.to(`bus:${bus._id}`).emit('bus:location_update', payload);
    if (bus.currentRoute) io.to(`route:${bus.currentRoute?._id || bus.currentRoute}`).emit('bus:location_update', payload);
    io.to('admin-dashboard').emit('bus:location_update', payload);

    // ── Delay Alert ──
    if (delay > 10 && !state.alertedDelay) {
      state.alertedDelay = true;
      const alert = await Alert.create({
        type:    'delay',
        severity:'warning',
        route:   bus.currentRoute?._id || bus.currentRoute,
        bus:     bus._id,
        message: `Bus ${bus.busNumber} is ${delay} minutes behind schedule on route ${bus.currentRoute?.route_name || ''}`,
        isResolved: false,
      });
      io.to('admin-dashboard').emit('alert:new', alert);
    } else if (delay <= 5) {
      state.alertedDelay = false; // reset so it can alert again if delay recurs
    }

    // ── Anomaly Detection via AI service (every 5th tick to avoid overload) ──
    state.anomalyTick = ((state.anomalyTick || 0) + 1) % 5;
    if (state.anomalyTick === 0) {
      try {
        const { data: anom } = await axios.post(
          `${AI_URL}/detect/anomaly`,
          { speed_kmh: speed, delay_minutes: delay, passenger_load: passengerLoad },
          { timeout: 3000 }
        );
        if (anom.is_anomaly && !state.alertedAnomaly) {
          state.alertedAnomaly = true;
          const anomAlert = await Alert.create({
            type:       'breakdown',
            severity:   'critical',
            route:      bus.currentRoute?._id || bus.currentRoute,
            bus:        bus._id,
            message:    `⚠️ Anomaly detected on Bus ${bus.busNumber}: ${anom.reason || 'unusual behaviour'} (score: ${(anom.score || 0).toFixed(2)})`,
            details:    { anomalyScore: anom.score, model: anom.model, speed, delay },
            isResolved: false,
          });
          io.to('admin-dashboard').emit('alert:new', anomAlert);
          io.to('admin-dashboard').emit('anomaly:detected', {
            busId: String(bus._id), busNumber: bus.busNumber,
            score: anom.score, reason: anom.reason, model: anom.model,
          });
        } else if (!anom.is_anomaly) {
          state.alertedAnomaly = false;
        }
      } catch { /* AI service unavailable — skip */ }
    }

    // ── Advance position ──
    state.t = (t + 0.2) % 1; // move 20% along stage segment each tick
    if (state.t < 0.2 && t >= 0.8) {
      // Crossed to next stage
      state.idx = (idx + 1) % stages.length;
      state.t   = 0;
    }
  } catch (err) {
    // Non-fatal: just log
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[GPS Sim] Error for bus ${bus?.busNumber}:`, err.message);
    }
  }
}

// ── Load stages for all active buses ─────────────────────────────────────────
async function loadBusStages(buses) {
  for (const bus of buses) {
    const routeId = bus.currentRoute?.url_route_id || bus.currentRoute?.route_id;
    let stages = [];

    if (routeId) {
      stages = await Stage.find({ url_route_id: routeId })
        .select('stage_name location seq _id')
        .sort({ seq: 1 })
        .lean();
    }

    // Flatten location to lat/lng
    const mapped = stages
      .filter(s => s.location?.coordinates?.length === 2)
      .map(s => ({
        _id:        s._id,
        stage_name: s.stage_name,
        lat:        s.location.coordinates[1],
        lng:        s.location.coordinates[0],
      }));

    const startIdx = Math.floor(Math.random() * Math.max(1, mapped.length));

    simState[String(bus._id)] = {
      stages:       mapped.length > 1 ? mapped : getDefaultDelhi(bus._id),
      idx:          startIdx % (mapped.length || 1),
      t:            Math.random(),
      delayMin:     Math.floor(Math.random() * 8),
      alertedDelay: false,
    };
  }
}

// Fake coordinates around Delhi if no real stages available
function getDefaultDelhi(busId) {
  const baseOffset = (parseInt(String(busId).slice(-4), 16) % 1000) / 100000;
  const pts = [];
  for (let i = 0; i < 12; i++) {
    pts.push({
      _id:        busId,
      stage_name: `Stop ${i + 1}`,
      lat:        28.6139 + baseOffset + i * 0.008 + (Math.random() - 0.5) * 0.004,
      lng:        77.2090 + baseOffset + i * 0.006 + (Math.random() - 0.5) * 0.004,
    });
  }
  return pts;
}

// ── Main runner ───────────────────────────────────────────────────────────────
async function runSimulation() {
  try {
    const activeBuses = await Bus.find({ status: 'active' })
      .populate('currentRoute', 'route_name url_route_id')
      .limit(20)
      .lean();

    if (!activeBuses.length) return;

    for (const bus of activeBuses) {
      await tickBus(bus);
    }
  } catch (err) {
    console.error('[GPS Sim] Tick error:', err.message);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────
async function startSimulator() {
  if (process.env.ENABLE_GPS_SIMULATOR !== 'true') {
    console.log('ℹ️  [GPS Sim] Disabled (set ENABLE_GPS_SIMULATOR=true to enable demo mode)');
    return;
  }

  if (isRunning) return;
  isRunning = true;

  console.log('🚌 [GPS Sim] Loading bus stages from MongoDB…');
  const activeBuses = await Bus.find({ status: 'active' })
    .populate('currentRoute', 'route_name url_route_id')
    .limit(20)
    .lean();

  await loadBusStages(activeBuses);
  console.log(`🚌 [GPS Sim] Started — tracking ${activeBuses.length} buses (5s interval)`);

  // First immediate tick
  await runSimulation();

  // Then every 5 seconds
  simInterval = setInterval(runSimulation, 5000);
}

function stopSimulator() {
  if (simInterval) {
    clearInterval(simInterval);
    simInterval = null;
    isRunning   = false;
    console.log('🛑 [GPS Sim] Stopped');
  }
}

async function resetSimulator() {
  stopSimulator();
  Object.keys(simState).forEach(k => delete simState[k]);
  await startSimulator();
}

module.exports = { startSimulator, stopSimulator, resetSimulator, runSimulation };
