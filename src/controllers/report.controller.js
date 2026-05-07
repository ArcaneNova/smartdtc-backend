const Analytics   = require('../models/Analytics');
const TripHistory = require('../models/TripHistory');
const Schedule    = require('../models/Schedule');
const Alert       = require('../models/Alert');

// GET /api/v1/reports/daily?date=&routeId=
exports.getDailyReport = async (req, res) => {
  try {
    const { date, routeId } = req.query;
    const filter = {};
    if (routeId) filter.route = routeId;
    if (date) {
      const d = new Date(date);
      filter.date = { $gte: d, $lt: new Date(d.getTime() + 86400000) };
    }

    const analytics = await Analytics.find(filter)
      .populate('route', 'route_name start_stage end_stage')
      .sort({ date: -1 });

    res.json({ success: true, analytics });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/summary  — dashboard KPIs
exports.getSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86400000);

    const [
      totalTripsToday,
      completedToday,
      activeAlerts,
      criticalAlerts,
    ] = await Promise.all([
      Schedule.countDocuments({ date: { $gte: today, $lt: tomorrow } }),
      TripHistory.countDocuments({ startTime: { $gte: today, $lt: tomorrow }, status: 'completed' }),
      Alert.countDocuments({ isResolved: false }),
      Alert.countDocuments({ isResolved: false, severity: 'critical' }),
    ]);

    res.json({
      success: true,
      summary: {
        totalTripsToday,
        completedToday,
        activeAlerts,
        criticalAlerts,
        date: today,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/trips?driverId=&busId=&routeId=&from=&to=
exports.getTripHistory = async (req, res) => {
  try {
    const { driverId, busId, routeId, from, to, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (driverId) filter.driver = driverId;
    if (busId)    filter.bus    = busId;
    if (routeId)  filter.route  = routeId;
    if (from || to) {
      filter.startTime = {};
      if (from) filter.startTime.$gte = new Date(from);
      if (to)   filter.startTime.$lte = new Date(to);
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [trips, total] = await Promise.all([
      TripHistory.find(filter)
        .populate('driver', 'userId licenseNo')
        .populate('bus',    'busNumber')
        .populate('route',  'route_name')
        .sort({ startTime: -1 })
        .skip(skip).limit(Number(limit)),
      TripHistory.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), trips });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/on-time-performance?routeId=&from=&to=
exports.getOnTimePerformance = async (req, res) => {
  try {
    const { routeId, from, to } = req.query;
    const match = {};
    if (routeId) match.route = require('mongoose').Types.ObjectId.createFromHexString(routeId);
    if (from || to) {
      match.startTime = {};
      if (from) match.startTime.$gte = new Date(from);
      if (to)   match.startTime.$lte = new Date(to);
    }

    const result = await TripHistory.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$route',
          totalTrips:      { $sum: 1 },
          onTimeTrips:     { $sum: { $cond: [{ $lte: ['$delayMinutes', 5] }, 1, 0] } },
          avgDelay:        { $avg: '$delayMinutes' },
          avgSpeed:        { $avg: '$avgSpeed' },
        },
      },
      {
        $project: {
          totalTrips: 1, onTimeTrips: 1, avgDelay: 1, avgSpeed: 1,
          onTimePercent: { $multiply: [{ $divide: ['$onTimeTrips', '$totalTrips'] }, 100] },
        },
      },
    ]);

    res.json({ success: true, performance: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/demand-by-hour?date=
// Returns actual trip counts and avg passenger load per hour from TripHistory
exports.getDemandByHour = async (req, res) => {
  try {
    const { date } = req.query;
    const base = date ? new Date(date) : new Date();
    base.setHours(0, 0, 0, 0);
    const end = new Date(base.getTime() + 86400000);

    const rows = await TripHistory.aggregate([
      { $match: { startTime: { $gte: base, $lt: end } } },
      {
        $group: {
          _id: { $hour: '$startTime' },
          actual:    { $sum: 1 },
          passengers: { $avg: { $ifNull: ['$passengerCount', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Also get scheduled counts per hour as "predicted"
    const scheduled = await Schedule.aggregate([
      { $match: { date: { $gte: base, $lt: end } } },
      {
        $group: {
          _id: { $hour: '$departureTime' },
          predicted: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const actualMap = {};
    const predictedMap = {};
    rows.forEach((r) => { actualMap[r._id] = r.actual; });
    scheduled.forEach((r) => { predictedMap[r._id] = r.predicted; });

    const hours = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      predicted: predictedMap[h] || 0,
      actual:    actualMap[h]    || 0,
    }));

    res.json({ success: true, hours });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/fleet-utilization?date=
// Returns active vs idle bus counts per hour from Schedules
exports.getFleetUtilization = async (req, res) => {
  try {
    const { date } = req.query;
    const base = date ? new Date(date) : new Date();
    base.setHours(0, 0, 0, 0);
    const end = new Date(base.getTime() + 86400000);

    const totalBuses = await require('../models/Bus').countDocuments({ status: { $in: ['active', 'in-service'] } });

    const scheduled = await Schedule.aggregate([
      { $match: { date: { $gte: base, $lt: end }, status: { $in: ['in-progress', 'scheduled', 'completed'] } } },
      {
        $group: {
          _id: { $hour: '$departureTime' },
          active: { $addToSet: '$bus' },
        },
      },
      { $project: { _id: 1, active: { $size: '$active' } } },
      { $sort: { _id: 1 } },
    ]);

    const activeMap = {};
    scheduled.forEach((r) => { activeMap[r._id] = r.active; });

    const hours = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      active: activeMap[h] || 0,
      idle:   Math.max(0, totalBuses - (activeMap[h] || 0)),
    }));

    res.json({ success: true, hours });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/delay-vs-load
// Returns real trip data: delayMinutes vs passengerCount
exports.getDelayVsLoad = async (req, res) => {
  try {
    const trips = await TripHistory.find(
      { delayMinutes: { $exists: true }, passengerCount: { $exists: true } },
      { delayMinutes: 1, passengerCount: 1, _id: 0 }
    ).limit(200).lean();

    const points = trips.map((t) => ({
      load:  t.passengerCount,
      delay: t.delayMinutes,
      z:     5,
    }));

    res.json({ success: true, points });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/export/excel?from=&to=&routeId=
exports.exportExcel = async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { from, to, routeId } = req.query;
    const filter = {};
    if (routeId) filter.route = routeId;
    if (from || to) {
      filter.startTime = {};
      if (from) filter.startTime.$gte = new Date(from);
      if (to)   filter.startTime.$lte = new Date(to);
    }

    const trips = await TripHistory.find(filter)
      .populate('driver', 'licenseNo')
      .populate('bus', 'busNumber')
      .populate('route', 'route_name')
      .sort({ startTime: -1 })
      .limit(1000)
      .lean();

    const workbook  = new ExcelJS.Workbook();
    workbook.creator = 'SmartDTC';

    const sheet = workbook.addWorksheet('Trip History');
    sheet.columns = [
      { header: 'Route',        key: 'route',        width: 25 },
      { header: 'Bus',          key: 'bus',          width: 15 },
      { header: 'Driver',       key: 'driver',       width: 15 },
      { header: 'Start Time',   key: 'startTime',    width: 22 },
      { header: 'End Time',     key: 'endTime',      width: 22 },
      { header: 'Status',       key: 'status',       width: 12 },
      { header: 'Delay (min)',  key: 'delay',        width: 14 },
      { header: 'Avg Speed',    key: 'avgSpeed',     width: 14 },
      { header: 'Passengers',   key: 'passengers',   width: 14 },
    ];

    for (const t of trips) {
      sheet.addRow({
        route:      t.route?.route_name  || '',
        bus:        t.bus?.busNumber     || '',
        driver:     t.driver?.licenseNo  || '',
        startTime:  t.startTime ? new Date(t.startTime).toLocaleString() : '',
        endTime:    t.endTime   ? new Date(t.endTime).toLocaleString()   : '',
        status:     t.status    || '',
        delay:      t.delayMinutes  ?? '',
        avgSpeed:   t.avgSpeed      ?? '',
        passengers: t.passengerCount ?? '',
      });
    }

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4B0082' } };
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const buffer = await workbook.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="SmartDTC_Report_${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/driver-leaderboard — top drivers by OTP/rating
exports.getDriverLeaderboard = async (req, res) => {
  try {
    const Driver = require('../models/Driver');
    const mongoose = require('mongoose');

    // Get last 30 days of trip history
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const rows = await TripHistory.aggregate([
      { $match: { startTime: { $gte: since }, status: 'completed' } },
      {
        $group: {
          _id: '$driver',
          totalTrips:  { $sum: 1 },
          onTimeTrips: { $sum: { $cond: [{ $lte: [{ $ifNull: ['$delayMinutes', 0] }, 5] }, 1, 0] } },
          avgDelay:    { $avg: { $ifNull: ['$delayMinutes', 0] } },
          avgSpeed:    { $avg: { $ifNull: ['$avgSpeed', 0] } },
          totalPassengers: { $sum: { $ifNull: ['$passengerCount', 0] } },
        },
      },
      {
        $project: {
          totalTrips: 1, onTimeTrips: 1, avgDelay: 1, avgSpeed: 1, totalPassengers: 1,
          otpPercent: {
            $cond: [
              { $gt: ['$totalTrips', 0] },
              { $multiply: [{ $divide: ['$onTimeTrips', '$totalTrips'] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { otpPercent: -1, totalTrips: -1 } },
      { $limit: 10 },
    ]);

    // Populate driver + userId info
    const driverIds = rows.map(r => r._id).filter(Boolean);
    const drivers = await Driver.find({ _id: { $in: driverIds } })
      .populate('userId', 'name email')
      .lean();

    const driverMap = {};
    drivers.forEach(d => { driverMap[String(d._id)] = d; });

    const leaderboard = rows.map((row, idx) => {
      const d = driverMap[String(row._id)] || {};
      return {
        rank: idx + 1,
        driverId: row._id,
        name: d.userId?.name || 'Unknown',
        email: d.userId?.email || '',
        rating: d.rating || 0,
        licenseNo: d.licenseNo || '',
        totalTrips: row.totalTrips,
        onTimeTrips: row.onTimeTrips,
        otpPercent: Math.round(row.otpPercent * 10) / 10,
        avgDelay: Math.round(row.avgDelay * 10) / 10,
        avgSpeed: Math.round(row.avgSpeed * 10) / 10,
        totalPassengers: row.totalPassengers,
      };
    });

    res.json({ success: true, leaderboard, period: '30 days' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/weekly-otp — last 7 days OTP trend
exports.getWeeklyOTP = async (req, res) => {
  try {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    const results = await Promise.all(days.map(async (dayStart) => {
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const [total, onTime, completed] = await Promise.all([
        Schedule.countDocuments({ date: { $gte: dayStart, $lt: dayEnd } }),
        TripHistory.countDocuments({ startTime: { $gte: dayStart, $lt: dayEnd }, delayMinutes: { $lte: 5 } }),
        TripHistory.countDocuments({ startTime: { $gte: dayStart, $lt: dayEnd }, status: 'completed' }),
      ]);
      const otp = total > 0 ? Math.round((onTime / Math.max(total, 1)) * 100) : 0;
      return {
        date: dayStart.toISOString().split('T')[0],
        label: dayStart.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
        total,
        completed,
        onTime,
        otp,
      };
    }));

    res.json({ success: true, trend: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/system-health
exports.getSystemHealth = async (req, res) => {
  try {
    const mongoose = require('mongoose');
    const { getIO } = require('../config/socket');
    const axios = require('axios');

    const dbState = ['disconnected','connected','connecting','disconnecting'];
    const dbStatus = dbState[mongoose.connection.readyState] || 'unknown';

    // Count connected sockets
    let socketCount = 0;
    try {
      const io = getIO();
      socketCount = (await io.fetchSockets()).length;
    } catch {}

    // Ping AI service
    let aiStatus = 'offline';
    let aiModels = {};
    try {
      const aiRes = await axios.get(`${process.env.AI_SERVICE_URL || 'http://localhost:8000'}/health`, { timeout: 3000 });
      aiStatus = aiRes.data.status || 'ok';
      aiModels = aiRes.data.models || {};
    } catch {}

    // DB stats
    const [totalRoutes, totalBuses, totalDrivers, totalUsers] = await Promise.all([
      require('../models/Route').countDocuments(),
      require('../models/Bus').countDocuments(),
      require('../models/Driver').countDocuments(),
      require('../models/User').countDocuments(),
    ]);

    res.json({
      success: true,
      health: {
        uptime: Math.round(process.uptime()),
        uptimeHuman: new Date(process.uptime() * 1000).toISOString().substr(11, 8),
        db: { status: dbStatus, healthy: dbStatus === 'connected' },
        sockets: { connected: socketCount },
        ai: { status: aiStatus, models: aiModels },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        },
        data: { routes: totalRoutes, buses: totalBuses, drivers: totalDrivers, users: totalUsers },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/route-summary — route-wise aggregated stats
exports.getRouteSummary = async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const rows = await TripHistory.aggregate([
      { $match: { startTime: { $gte: since } } },
      {
        $group: {
          _id: '$route',
          totalTrips:   { $sum: 1 },
          completed:    { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          onTime:       { $sum: { $cond: [{ $lte: [{ $ifNull: ['$delayMinutes', 0] }, 5] }, 1, 0] } },
          avgDelay:     { $avg: { $ifNull: ['$delayMinutes', 0] } },
          avgSpeed:     { $avg: { $ifNull: ['$avgSpeed', 0] } },
          totalPassengers: { $sum: { $ifNull: ['$passengerCount', 0] } },
        },
      },
      {
        $project: {
          totalTrips: 1, completed: 1, onTime: 1, avgDelay: 1, avgSpeed: 1, totalPassengers: 1,
          otpPercent: {
            $cond: [{ $gt: ['$totalTrips', 0] },
              { $multiply: [{ $divide: ['$onTime', '$totalTrips'] }, 100] }, 0],
          },
        },
      },
      { $sort: { totalTrips: -1 } },
      { $limit: 50 },
    ]);

    const Route = require('../models/Route');
    const routeIds = rows.map(r => r._id).filter(Boolean);
    const routes = await Route.find({ _id: { $in: routeIds } }, 'route_name start_stage end_stage distance_km').lean();
    const routeMap = {};
    routes.forEach(r => { routeMap[String(r._id)] = r; });

    const summary = rows.map(row => ({
      routeId: row._id,
      routeName: routeMap[String(row._id)]?.route_name || '—',
      startStage: routeMap[String(row._id)]?.start_stage || '—',
      endStage: routeMap[String(row._id)]?.end_stage || '—',
      distanceKm: routeMap[String(row._id)]?.distance_km || 0,
      totalTrips: row.totalTrips,
      completed: row.completed,
      otpPercent: Math.round(row.otpPercent * 10) / 10,
      avgDelay: Math.round((row.avgDelay || 0) * 10) / 10,
      avgSpeed: Math.round((row.avgSpeed || 0) * 10) / 10,
      totalPassengers: row.totalPassengers,
    }));

    res.json({ success: true, summary, period: '30 days' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/reports/export/pdf?from=&to=&routeId=
exports.exportPDF = async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const { from, to, routeId } = req.query;
    const filter = {};
    if (routeId) filter.route = routeId;
    if (from || to) {
      filter.startTime = {};
      if (from) filter.startTime.$gte = new Date(from);
      if (to)   filter.startTime.$lte = new Date(to);
    }

    const [trips, activeAlerts, completedToday] = await Promise.all([
      TripHistory.find(filter)
        .populate('route', 'route_name').populate('bus', 'busNumber').populate('driver', 'licenseNo')
        .sort({ startTime: -1 }).limit(50).lean(),
      Alert.countDocuments({ isResolved: false }),
      TripHistory.countDocuments({ status: 'completed' }),
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="SmartDTC_Report_${Date.now()}.pdf"`);
    doc.pipe(res);

    // Title
    doc.fontSize(20).fillColor('#4B0082').text('SmartDTC — System Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(1);

    // Summary box
    doc.fontSize(13).fillColor('#000').text('Summary', { underline: true });
    doc.fontSize(11).text(`Total Trips (filtered): ${trips.length}`);
    doc.text(`Completed Trips (all time): ${completedToday}`);
    doc.text(`Active Alerts: ${activeAlerts}`);
    doc.moveDown(1);

    // Trip table header
    doc.fontSize(13).fillColor('#000').text('Recent Trips', { underline: true });
    doc.moveDown(0.3);
    const cols = [40, 180, 290, 360, 430];
    doc.fontSize(9).fillColor('#FFF')
      .rect(cols[0] - 5, doc.y - 2, 520, 14).fill('#4B0082')
      .fillColor('#FFF')
      .text('Route',       cols[0], doc.y - 12, { continued: true, width: 130 })
      .text('Bus',         cols[1], doc.y,       { continued: true, width: 100 })
      .text('Start',       cols[2], doc.y,       { continued: true, width: 90 })
      .text('Status',      cols[3], doc.y,       { continued: true, width: 60 })
      .text('Delay (min)', cols[4], doc.y,       { width: 60 });

    doc.fillColor('#000');
    for (const [i, t] of trips.entries()) {
      const y = doc.y;
      if (i % 2 === 0) doc.rect(cols[0] - 5, y - 1, 520, 13).fill('#F3E8FF').fillColor('#000');
      doc.fontSize(8)
        .text(t.route?.route_name || '—', cols[0], y, { continued: true, width: 130 })
        .text(t.bus?.busNumber    || '—', cols[1], y, { continued: true, width: 100 })
        .text(t.startTime ? new Date(t.startTime).toLocaleDateString() : '—', cols[2], y, { continued: true, width: 90 })
        .text(t.status    || '—', cols[3], y, { continued: true, width: 60 })
        .text(String(t.delayMinutes ?? '—'), cols[4], y, { width: 60 });
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
