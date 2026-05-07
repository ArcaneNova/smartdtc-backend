const Bus = require('../models/Bus');

// GET /api/v1/buses?status=&page=1&limit=20
exports.getAllBuses = async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type)   filter.type   = type;

    const skip = (Number(page) - 1) * Number(limit);
    const [buses, total] = await Promise.all([
      Bus.find(filter)
        .populate('currentRoute', 'route_name')
        .populate('currentDriver', 'userId licenseNo')
        .skip(skip).limit(Number(limit)),
      Bus.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), buses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/buses/:id
exports.getBus = async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.id)
      .populate('currentRoute').populate('currentDriver');
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });
    res.json({ success: true, bus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/buses  (admin)
exports.createBus = async (req, res) => {
  try {
    const bus = await Bus.create(req.body);
    res.status(201).json({ success: true, bus });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/buses/:id  (admin/dispatcher)
exports.updateBus = async (req, res) => {
  try {
    const bus = await Bus.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });
    res.json({ success: true, bus });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/v1/buses/:id  (admin)
exports.deleteBus = async (req, res) => {
  try {
    const bus = await Bus.findByIdAndDelete(req.params.id);
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });
    res.json({ success: true, message: 'Bus deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/v1/buses/:id/status  (admin/dispatcher)
exports.updateBusStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['active', 'idle', 'maintenance', 'retired'];
    if (!allowed.includes(status))
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });

    const bus = await Bus.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true, runValidators: true }
    );
    if (!bus) return res.status(404).json({ success: false, message: 'Bus not found.' });

    // Emit real-time update via socket if available
    const io = req.app.get('io');
    if (io) io.emit('bus:status_update', { busId: bus._id, status: bus.status });

    res.json({ success: true, bus });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/buses/stats  (admin)
exports.getBusStats = async (req, res) => {
  try {
    const stats = await Bus.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
