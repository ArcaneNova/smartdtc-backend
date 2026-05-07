const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/bus.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/stats', authorize('admin', 'dispatcher'), ctrl.getBusStats);
router.get('/',      authorize('admin', 'dispatcher'), ctrl.getAllBuses);
router.get('/:id',   authorize('admin', 'dispatcher'), ctrl.getBus);
router.post('/',     authorize('admin'),               ctrl.createBus);
router.patch('/:id/status', authorize('admin', 'dispatcher'), ctrl.updateBusStatus);
router.put('/:id',   authorize('admin', 'dispatcher'), ctrl.updateBus);
router.delete('/:id',authorize('admin'),               ctrl.deleteBus);

module.exports = router;
