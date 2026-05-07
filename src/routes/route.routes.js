const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/route.controller');
const { protect, authorize } = require('../middleware/auth');

// public
router.get('/',               ctrl.getAllRoutes);
router.get('/:id',            ctrl.getRoute);
router.get('/:id/stages',     ctrl.getRouteStages);

// protected
router.use(protect);
router.post('/',      authorize('admin', 'dispatcher'), ctrl.createRoute);
router.put('/:id',     authorize('admin', 'dispatcher'), ctrl.updateRoute);
router.patch('/:id/toggle', authorize('admin', 'dispatcher'), ctrl.toggleRoute);
router.delete('/:id',  authorize('admin'),               ctrl.deleteRoute);

module.exports = router;
