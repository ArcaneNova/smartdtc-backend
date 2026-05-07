const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/tracking.controller');
const { protect, authorize } = require('../middleware/auth');

// public — passengers can track buses
router.get('/live',          ctrl.getLiveBuses);
router.get('/nearby',        ctrl.getNearbyBuses);
router.get('/bus/:busId',    ctrl.getBusPosition);
router.get('/route/:routeId',ctrl.getBusesByRoute);

module.exports = router;
