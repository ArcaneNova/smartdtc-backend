const { Server } = require('socket.io');
const logger = require('../utils/logger');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [process.env.CLIENT_URL, 'http://localhost:3000', 'http://localhost:19006'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  io.on('connection', (socket) => {
    logger.info(`🔌 Socket connected: ${socket.id}`);

    // ── Admin subscribes to SOS alerts room ────────────────────
    socket.on('admin:subscribe_sos', () => {
      socket.join('sos-alerts');
      logger.info(`Admin joined SOS room: ${socket.id}`);
    });

    // ── Admin subscribes to all buses ──────────────────────────
    socket.on('admin:subscribe_all', () => {
      socket.join('admin-dashboard');
      socket.join('sos-alerts'); // admins always get SOS
      logger.info(`Admin joined dashboard room: ${socket.id}`);
    });

    // ── Admin subscribes to specific route ─────────────────────
    socket.on('admin:subscribe_route', ({ routeId }) => {
      socket.join(`route:${routeId}`);
    });

    // ── Passenger tracks a specific bus ────────────────────────
    socket.on('passenger:track_bus', ({ busId }) => {
      socket.join(`bus:${busId}`);
    });

    // ── Passenger watches a stop ────────────────────────────────
    socket.on('passenger:set_watch_stop', ({ stopId, busId, alertThresholdMinutes }) => {
      socket.data.watchStop = { stopId, busId, alertThresholdMinutes };
      socket.join(`stop:${stopId}`);
    });

    // ── Driver sends GPS update ─────────────────────────────────
    socket.on('driver:gps_update', async (data) => {
      const busId = data.busId;
      const lat = data.lat ?? data.latitude;
      const lng = data.lng ?? data.longitude;
      const speed = data.speed;
      const heading = data.heading;
      const routeId = data.routeId;
      if (!busId || lat === undefined || lng === undefined) return;

      // Broadcast to all tracking this bus and its route
      const payload = { busId, lat, lng, speed, heading, routeId, isSimulated: false };
      io.to(`bus:${busId}`).emit('bus:location_update', payload);
      if (routeId) io.to(`route:${routeId}`).emit('bus:location_update', payload);
      io.to('admin-dashboard').emit('bus:location_update', payload);

      // Persist to DB asynchronously (import here to avoid circular deps)
      try {
        const BusPosition = require('../models/BusPosition');
        await BusPosition.create({
          bus: busId, route: routeId,
          location: { type: 'Point', coordinates: [lng, lat] },
          speed, heading, timestamp: new Date(), isSimulated: false,
        });
      } catch (err) {
        logger.error('Error saving bus position: ' + err.message);
      }
    });

    // ── Driver reports trip started ─────────────────────────────
    socket.on('driver:trip_started', ({ scheduleId, busId }) => {
      io.to('admin-dashboard').emit('driver:trip_started', { scheduleId, busId, timestamp: new Date() });
      socket.join(`driver:${socket.id}`);
    });

    // ── Driver reports arrival at stop ──────────────────────────
    socket.on('driver:arrived_stop', ({ busId, stageId, routeId }) => {
      io.to(`route:${routeId}`).emit('bus:arrived', { busId, stageId, timestamp: new Date() });
      io.to(`stop:${stageId}`).emit('bus:arrived', { busId, stageId, timestamp: new Date() });
      io.to('admin-dashboard').emit('bus:arrived', { busId, stageId, timestamp: new Date() });
    });

    // ── Passenger SOS ───────────────────────────────────────────
    socket.on('passenger:sos', (data) => {
      const sosPayload = {
        type: 'sos', severity: 'critical',
        message: `🚨 Passenger SOS: ${data.type || 'emergency'} — ${data.message || ''}`,
        userId: data.userId,
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: new Date(),
        ...data,
      };
      // Broadcast to both admin dashboard AND dedicated SOS room
      io.to('admin-dashboard').emit('alert:new', sosPayload);
      io.to('sos-alerts').emit('sos:new', sosPayload);
    });

    // ── Driver SOS ──────────────────────────────────────────────
    socket.on('driver:sos', (data) => {
      io.to('admin-dashboard').emit('alert:new', {
        type: 'breakdown', severity: 'critical',
        message: `🚨 SOS from Bus ${data.busId}: ${data.reason}`,
        ...data,
      });
      io.to('sos-alerts').emit('sos:new', { ...data, source: 'driver' });
    });

    socket.on('disconnect', () => {
      logger.info(`🔌 Socket disconnected: ${socket.id}`);
    });
  });

  logger.info('✅ Socket.io initialized');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

module.exports = { initSocket, getIO };
