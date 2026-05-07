const Alert = require('../models/Alert');
const { getIO } = require('../config/socket');

// GET /api/v1/alerts?isResolved=false&severity=&page=1&limit=20
exports.getAlerts = async (req, res) => {
  try {
    const { isResolved, severity, type, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (isResolved !== undefined) filter.isResolved = isResolved === 'true';
    if (severity)  filter.severity = severity;
    if (type)      filter.type     = type;

    const skip = (Number(page) - 1) * Number(limit);
    const [alerts, total] = await Promise.all([
      Alert.find(filter)
        .populate('route', 'route_name')
        .populate('bus',   'busNumber')
        .populate('driver','userId')
        .sort({ createdAt: -1 })
        .skip(skip).limit(Number(limit)),
      Alert.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/alerts  (admin/dispatcher/driver via API)
exports.createAlert = async (req, res) => {
  try {
    const alert = await Alert.create(req.body);

    // Broadcast to admin room
    try {
      getIO().to('admin-dashboard').emit('admin:new_alert', alert);
    } catch { /* socket not ready */ }

    res.status(201).json({ success: true, alert });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/alerts/:id/resolve  (admin/dispatcher)
exports.resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { isResolved: true, resolvedAt: new Date(), resolvedBy: req.user._id },
      { new: true }
    );
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });

    try {
      getIO().to('admin-dashboard').emit('admin:alert_resolved', { alertId: alert._id });
    } catch { /* socket not ready */ }

    res.json({ success: true, alert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/v1/alerts/:id  (admin)
exports.deleteAlert = async (req, res) => {
  try {
    await Alert.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Alert deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
