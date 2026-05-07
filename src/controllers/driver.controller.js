const Driver = require('../models/Driver');
const User   = require('../models/User');
const Bus    = require('../models/Bus');

// GET /api/v1/drivers?status=&page=1&limit=20
exports.getAllDrivers = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [drivers, total] = await Promise.all([
      Driver.find(filter)
        .populate('userId', 'name email phone')
        .populate('assignedBus', 'busNumber model')
        .populate('assignedRoute', 'route_name')
        .skip(skip).limit(Number(limit)),
      Driver.countDocuments(filter),
    ]);

    res.json({ success: true, total, page: Number(page), drivers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/drivers/:id
exports.getDriver = async (req, res) => {
  try {
    const driver = await Driver.findById(req.params.id)
      .populate('userId', 'name email phone')
      .populate('assignedBus').populate('assignedRoute');
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });
    res.json({ success: true, driver });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/drivers  (admin) — creates User + Driver in one step
exports.createDriver = async (req, res) => {
  try {
    const { name, email, password, phone, licenseNo, experience } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const user   = await User.create({ name, email, password, phone, role: 'driver' });
    const driver = await Driver.create({ userId: user._id, licenseNo, experience: experience || 0 });

    user.password = undefined;
    res.status(201).json({ success: true, user, driver });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/drivers/:id  (admin/dispatcher)
exports.updateDriver = async (req, res) => {
  try {
    const driver = await Driver.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });
    res.json({ success: true, driver });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/drivers/:id/assign  (admin/dispatcher)
exports.assignDriver = async (req, res) => {
  try {
    const { busId, routeId } = req.body;
    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { assignedBus: busId, assignedRoute: routeId, status: 'on-duty' },
      { new: true }
    );
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });

    // Also update Bus's currentDriver
    if (busId) await Bus.findByIdAndUpdate(busId, { currentDriver: driver._id, currentRoute: routeId });

    res.json({ success: true, driver });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// PATCH /api/v1/drivers/:id/assign  (admin/dispatcher) — assign bus only (from FE modal)
exports.assignBus = async (req, res) => {
  try {
    const { busId } = req.body;
    if (!busId) return res.status(400).json({ success: false, message: 'busId is required.' });

    // Unassign bus from any previous driver
    await Driver.updateMany({ assignedBus: busId, _id: { $ne: req.params.id } }, { $unset: { assignedBus: 1 } });

    const driver = await Driver.findByIdAndUpdate(
      req.params.id,
      { assignedBus: busId, status: 'available' },
      { new: true }
    ).populate('assignedBus', 'busNumber model');

    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });

    await Bus.findByIdAndUpdate(busId, { currentDriver: driver._id });

    res.json({ success: true, driver });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/v1/drivers/:id  (admin)
exports.deleteDriver = async (req, res) => {
  try {
    const driver = await Driver.findByIdAndDelete(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: 'Driver not found.' });
    await User.findByIdAndUpdate(driver.userId, { isActive: false });
    res.json({ success: true, message: 'Driver deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
