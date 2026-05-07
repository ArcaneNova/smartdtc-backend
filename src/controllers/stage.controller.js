const Stage = require('../models/Stage');

// GET /api/v1/stages?routeId=&page=1&limit=50
exports.getStagesByRoute = async (req, res) => {
  try {
    const { routeId, page = 1, limit = 100 } = req.query;
    if (!routeId) return res.status(400).json({ success: false, message: 'routeId required.' });

    const stages = await Stage.find({ url_route_id: routeId }).sort({ seq: 1 })
      .skip((Number(page) - 1) * Number(limit)).limit(Number(limit));

    res.json({ success: true, count: stages.length, stages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/stages/nearby?lat=&lng=&radius=500
exports.getNearbyStages = async (req, res) => {
  try {
    const { lat, lng, radius = 500 } = req.query;
    if (!lat || !lng) return res.status(400).json({ success: false, message: 'lat and lng required.' });

    const stages = await Stage.find({
      location: {
        $nearSphere: {
          $geometry:    { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: Number(radius),
        },
      },
    }).limit(20);

    res.json({ success: true, count: stages.length, stages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/stages/:id
exports.getStage = async (req, res) => {
  try {
    const stage = await Stage.findById(req.params.id);
    if (!stage) return res.status(404).json({ success: false, message: 'Stage not found.' });
    res.json({ success: true, stage });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/stages/search?name=
exports.searchStages = async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) return res.status(400).json({ success: false, message: 'name query required.' });

    const stages = await Stage.find({
      stage_name: { $regex: name, $options: 'i' },
    }).limit(30).select('_id stage_name url_route_id seq location');

    res.json({ success: true, stages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/v1/stages/all?limit=5000
exports.getAllStages = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 5000, 10000);
    const stages = await Stage.find({}).sort({ stage_name: 1 }).limit(limit).select('_id stage_name url_route_id seq location');
    res.json({ success: true, count: stages.length, stages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
