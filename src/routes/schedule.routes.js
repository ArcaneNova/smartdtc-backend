const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/schedule.controller');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

router.get('/',                       ctrl.getSchedules);
router.get('/:id',                    ctrl.getSchedule);
router.post('/bulk',                  authorize('admin', 'dispatcher'), ctrl.bulkCreateSchedule);
router.post('/generate-ai/apply',     authorize('admin', 'dispatcher'), ctrl.applyAISchedule);
router.post('/generate-ai',           authorize('admin', 'dispatcher'), ctrl.generateAISchedule);
router.post('/emergency',             authorize('admin', 'dispatcher'), ctrl.emergencyDispatch);
router.post('/',                      authorize('admin', 'dispatcher'), ctrl.createSchedule);
router.put('/:id',                    authorize('admin', 'dispatcher'), ctrl.updateSchedule);
router.delete('/:id',                 authorize('admin', 'dispatcher'), ctrl.deleteSchedule);


module.exports = router;
