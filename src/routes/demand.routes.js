const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/demand.controller');
const { protect, authorize } = require('../middleware/auth');

router.get('/heatmap',             ctrl.getHeatmap);
router.get('/',                    ctrl.getDemand);
router.post('/predict',            protect, authorize('admin','dispatcher'), ctrl.predictDemand);
router.post('/predict/all-models', protect, authorize('admin','dispatcher'), ctrl.predictDemandAllModels);
router.put('/:id/actual',          protect, authorize('admin','dispatcher'), ctrl.updateActual);

module.exports = router;
