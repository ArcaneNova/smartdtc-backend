const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/driver.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/',              authorize('admin', 'dispatcher'), ctrl.getAllDrivers);
router.get('/:id',           authorize('admin', 'dispatcher'), ctrl.getDriver);
router.post('/',             authorize('admin'),               ctrl.createDriver);
router.put('/:id',           authorize('admin', 'dispatcher'), ctrl.updateDriver);
router.put('/:id/assign',    authorize('admin', 'dispatcher'), ctrl.assignDriver);
router.patch('/:id/assign',  authorize('admin', 'dispatcher'), ctrl.assignBus);
router.delete('/:id',        authorize('admin'),               ctrl.deleteDriver);

module.exports = router;
