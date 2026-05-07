const BusPosition = require('../models/BusPosition');
const Bus         = require('../models/Bus');

// GET /api/v1/tracking/live  — all buses with recent position (normalized for mobile)
exports.getLiveBuses = async (req, res) => {
  try {
    // Include simulated buses (GPS simulator used in demo/dev mode)
    const raw = await BusPosition.aggregate([
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$bus', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $lookup: { from: 'buses', localField: 'bus', foreignField: '_id', as: 'busInfo' } },
      { $unwind: { path: '$busInfo', preserveNullAndEmptyArrays: true } },
      { $lookup: { from: 'routes', localField: 'route', foreignField: '_id', as: 'routeInfo' } },
      { $unwind: { path: '$routeInfo', preserveNullAndEmptyArrays: true } },
    ]);

    // Normalize for mobile map
    const positions = raw.map(p => {
      const coords = p.location?.coordinates;
      return {
        ...p,
        busId: String(p.bus),
        busNumber: p.busInfo?.busNumber || 'Bus',
        lat: coords ? coords[1] : null,
        lng: coords ? coords[0] : null,
        speed: p.speed || 0,
        delay: p.delay_minutes || 0,
        passenger_load: p.passenger_load || 0,
        routeName: p.routeInfo?.route_name || '',
        nextStop: p.nextStage?.stage_name || p.nextStop || '',
      };
    }).filter(p => p.lat && p.lng);

    res.json({ success: true, count: positions.length, positions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/tracking/bus/:busId  — latest position for one bus
exports.getBusPosition = async (req, res) => {
  try {
    const pos = await BusPosition.findOne({ bus: req.params.busId })
      .where('isSimulated').ne(true)
      .sort({ timestamp: -1 })
      .populate('route', 'route_name')
      .populate('nextStage', 'stage_name location');

    if (!pos) return res.status(404).json({ success: false, message: 'No position data found.' });
    res.json({ success: true, position: pos });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/tracking/route/:routeId  — all buses on a route
exports.getBusesByRoute = async (req, res) => {
  try {
    const { Types } = require('mongoose');
    const positions = await BusPosition.aggregate([
      { $match: { route: new Types.ObjectId(req.params.routeId) } },
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$bus', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]);

    res.json({ success: true, count: positions.length, positions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/tracking/nearby?lat=&lng=&radius=1000
exports.getNearbyBuses = async (req, res) => {
  try {
    const { lat, lng, radius = 1000 } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, message: 'lat and lng required.' });

    // Get all recent positions and filter by distance using MongoDB $geoNear
    const positions = await BusPosition.aggregate([
      {
        $geoNear: {
          near:          { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          distanceField: 'distance',
          maxDistance:   Number(radius),
          spherical:     true,
          query:         {}, // include simulated buses for demo mode
        },
      },
      { $sort: { bus: 1, timestamp: -1 } },
      { $group: { _id: '$bus', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { distance: 1 } },
      { $limit: 10 },
    ]);

    res.json({ success: true, count: positions.length, positions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
