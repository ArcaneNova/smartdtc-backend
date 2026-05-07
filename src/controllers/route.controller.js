const Route = require('../models/Route');
const Stage = require('../models/Stage');

// GET /api/v1/routes?search=&page=1&limit=20
exports.getAllRoutes = async (req, res) => {
  try {
    const { search, page = 1, limit = 20, isActive } = req.query;
    const filter = {};

    if (search) filter.$text = { $search: search };
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const skip  = (Number(page) - 1) * Number(limit);
    const [routes, total] = await Promise.all([
      Route.find(filter)
        .sort(search ? { score: { $meta: 'textScore' } } : { route_name: 1 })
        .skip(skip)
        .limit(Number(limit)),
      Route.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), routes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/routes/:id
exports.getRoute = async (req, res) => {
  try {
    console.log('[GET ROUTE] Fetching route:', req.params.id);
    const route = await Route.findById(req.params.id);
    if (!route) {
      console.log('[GET ROUTE] Route not found');
      return res.status(404).json({ success: false, message: 'Route not found.' });
    }
    console.log('[GET ROUTE] Route found:', route.route_name);
    res.json({ success: true, route });
  } catch (err) {
    console.error('[GET ROUTE ERROR]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/routes  (admin/dispatcher)
exports.createRoute = async (req, res) => {
  try {
    const route = await Route.create(req.body);
    res.status(201).json({ success: true, route });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/routes/:id  (admin/dispatcher)
exports.updateRoute = async (req, res) => {
  try {
    const route = await Route.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });
    res.json({ success: true, route });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/v1/routes/:id  (admin only)
exports.deleteRoute = async (req, res) => {
  try {
    const route = await Route.findByIdAndDelete(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });
    res.json({ success: true, message: 'Route deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/routes/:id/stages
exports.getRouteStages = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });

    const stages = await Stage.find({ url_route_id: route.url_route_id })
      .sort({ seq: 1 })
      .lean();

    res.json({ success: true, count: stages.length, stages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/v1/routes/:id/toggle — activate/deactivate route
exports.toggleRoute = async (req, res) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: 'Route not found.' });
    route.isActive = !route.isActive;
    await route.save();
    res.json({ success: true, route, message: `Route ${route.isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
