const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/alert.controller');
const { protect, authorize } = require('../middleware/auth');
const { getIO } = require('../config/socket');
const Alert   = require('../models/Alert');
const PushToken = require('../models/PushToken');
const User    = require('../models/User');
const notificationService = require('../services/notification.service');

router.get('/', ctrl.getAlerts);

router.use(protect);
router.post('/',          ctrl.createAlert);
router.put('/:id/resolve',authorize('admin','dispatcher'), ctrl.resolveAlert);
router.delete('/:id',     authorize('admin'),              ctrl.deleteAlert);

// POST /api/v1/alerts/passenger-sos  — passenger safety SOS
// Called from mobile-app/(passenger)/sos.tsx
router.post('/passenger-sos', async (req, res) => {
  try {
    const {
      type = 'sos',
      message,
      latitude,
      longitude,
      busNumber,
      routeName,
      scheduleId,
    } = req.body;

    const locationStr = latitude && longitude
      ? ` | Location: ${parseFloat(latitude).toFixed(5)}, ${parseFloat(longitude).toFixed(5)}`
      : '';

    const alert = await Alert.create({
      type:     'sos',
      severity: 'critical',
      message:  message || `Passenger SOS — ${type}${locationStr}`,
      details: {
        reportedBy: req.user._id,
        reportType: type,
        latitude,
        longitude,
        busNumber,
        routeName,
        scheduleId,
        timestamp: new Date(),
      },
      isResolved: false,
    });

    // Broadcast to admin dashboard via socket (both admin room AND dedicated SOS room)
    try {
      getIO().to('admin-dashboard').emit('admin:new_alert', alert);
      getIO().to('sos-alerts').emit('sos:new', {
        alertId:   alert._id,
        userId:    req.user._id,
        userName:  req.user.name,
        message:   alert.message,
        severity:  'critical',
        latitude,
        longitude,
        type,
        timestamp: new Date(),
      });
    } catch { /* socket not ready */ }

    // Push notification to all admin users' tokens
    try {
      const adminUsers = await User.find({ role: 'admin' }).select('_id');
      const adminIds = adminUsers.map(u => u._id);
      const adminTokens = await PushToken.find({ user: { $in: adminIds }, isActive: true });
      if (adminTokens.length > 0) {
        await notificationService.sendBatchNotifications(
          adminTokens.map(t => ({
            to:    t.expoPushToken,
            title: '🚨 Passenger SOS Alert',
            body:  alert.message,
            data:  { alertId: String(alert._id), type: 'sos' },
          }))
        );
      }
    } catch { /* notification service unavailable */ }

    res.status(201).json({
      success: true,
      message: 'SOS reported. Help is on the way.',
      alertId: alert._id,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
