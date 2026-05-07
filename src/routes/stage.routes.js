const express = require('express');
const router  = express.Router();

const ctrl = require('../controllers/stage.controller');

// all public
router.get('/',        ctrl.getStagesByRoute);
router.get('/all',     ctrl.getAllStages);
router.get('/nearby',  ctrl.getNearbyStages);
router.get('/search',  ctrl.searchStages);
router.get('/:id',     ctrl.getStage);

module.exports = router;
