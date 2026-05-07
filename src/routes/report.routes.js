const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/report.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect, authorize('admin','dispatcher'));

router.get('/daily',               ctrl.getDailyReport);
router.get('/summary',             ctrl.getSummary);
router.get('/trips',               ctrl.getTripHistory);
router.get('/on-time-performance', ctrl.getOnTimePerformance);
router.get('/demand-by-hour',      ctrl.getDemandByHour);
router.get('/fleet-utilization',   ctrl.getFleetUtilization);
router.get('/delay-vs-load',       ctrl.getDelayVsLoad);
router.get('/driver-leaderboard',  ctrl.getDriverLeaderboard);
router.get('/weekly-otp',          ctrl.getWeeklyOTP);
router.get('/system-health',       ctrl.getSystemHealth);
router.get('/route-summary',       ctrl.getRouteSummary);
router.get('/export/excel',        ctrl.exportExcel);
router.get('/export/pdf',          ctrl.exportPDF);

module.exports = router;
