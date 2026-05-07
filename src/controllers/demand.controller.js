const PassengerDemand = require('../models/PassengerDemand');
const axios           = require('axios');

const AI_URL = process.env.PYTHON_AI_URL || 'http://localhost:8000';

// GET /api/v1/demand?routeId=&date=&hour=&limit=
exports.getDemand = async (req, res) => {
  try {
    const { routeId, date, hour, limit = 200 } = req.query;
    const filter = {};
    if (routeId) filter.route = routeId;
    if (hour !== undefined) filter.hour = Number(hour);
    if (date) {
      const d = new Date(date);
      filter.forDate = { $gte: d, $lt: new Date(d.getTime() + 86400000) };
    }

    const demands = await PassengerDemand.find(filter)
      .populate('route', 'route_name')
      .sort({ forDate: -1, hour: 1 })
      .limit(Number(limit));

    res.json({ success: true, demand: demands, demands });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/demand/predict
exports.predictDemand = async (req, res) => {
  const payload = req.body;
  const modelKey = payload.model_key || 'auto';

  try {
    const aiRes  = await axios.post(
      `${AI_URL}/predict/demand?model=${modelKey}`,
      payload,
      { timeout: 10000 }
    );
    const aiData = aiRes.data;

    // AI service now returns the full prediction flat (no nested .prediction)
    const predicted_count = aiData.predicted_count ?? aiData.prediction?.predicted_count ?? 0;
    const crowd_level     = aiData.crowd_level     ?? aiData.prediction?.crowd_level     ?? 'low';
    const model_used      = aiData.model           ?? aiData.prediction?.model            ?? 'lstm';
    const confidence      = aiData.confidence      ?? aiData.prediction?.confidence       ?? 0.87;
    const metrics         = aiData.metrics         ?? null;

    // Persist to DB (non-blocking)
    PassengerDemand.create({
      route:          payload.route_id,
      forDate:        new Date(payload.date),
      hour:           payload.hour,
      predictedCount: predicted_count,
      crowdLevel:     crowd_level,
      weather:        payload.weather || 'clear',
      isWeekend:      payload.is_weekend || false,
      isHoliday:      payload.is_holiday || false,
      modelUsed:      model_used,
    }).catch(() => {});

    res.status(201).json({
      success: true,
      prediction: {
        predicted_count,
        crowd_level,
        confidence,
        model:       model_used,
        is_best:     aiData.is_best_model ?? true,
        metrics,
        peak_factor: _peakFactor(payload.hour),
      },
    });
  } catch (err) {
    const status = err.response?.status || (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ? 503 : 500);
    const detail = err.response?.data?.detail || err.response?.data?.message || err.message;
    return res.status(status).json({
      success: false,
      message: 'Demand prediction failed',
      error:   detail,
      ai_url:  AI_URL,
      hint:    status === 503
        ? 'AI service is unreachable. Check AI_SERVICE_URL on backend and that the AI service is running.'
        : 'AI service returned an error. Check payload and model availability.',
    });
  }
};

// POST /api/v1/demand/predict/all-models
exports.predictDemandAllModels = async (req, res) => {
  try {
    const aiRes = await axios.post(`${AI_URL}/predict/demand/all-models`, req.body, { timeout: 30000 });
    res.status(200).json({ success: true, ...aiRes.data });
  } catch (err) {
    const status = err.response?.status || (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' ? 503 : 500);
    const detail = err.response?.data?.detail || err.response?.data?.message || err.message;
    return res.status(status).json({
      success: false,
      message: 'All-models comparison failed',
      error:   detail,
      ai_url:  AI_URL,
    });
  }
};

// GET /api/v1/demand/heatmap
exports.getHeatmap = async (req, res) => {
  try {
    const { date, hour } = req.query;
    const filter = {};
    if (hour !== undefined) filter.hour = Number(hour);
    if (date) {
      const d = new Date(date);
      filter.forDate = { $gte: d, $lt: new Date(d.getTime() + 86400000) };
    }

    const Stage         = require('../models/Stage');
    const PassengerDemand = require('../models/PassengerDemand');

    const demands   = await PassengerDemand.find(filter).populate('route','route_name').limit(500).lean();
    const allStages = await Stage.find({}).select('route lat lng stage_name').lean();
    const stageMap  = {};
    for (const s of allStages) {
      const key = String(s.route);
      if (!stageMap[key]) stageMap[key] = [];
      if (s.lat && s.lng) stageMap[key].push({ lat: s.lat, lng: s.lng });
    }

    const points = [];
    for (const d of demands) {
      const routeId   = String(d.route?._id || d.route || '');
      const stages    = stageMap[routeId] || [];
      const intensity = d.predictedCount || 0;
      if (intensity <= 0) continue;
      for (const st of stages) {
        points.push({ lat: st.lat, lng: st.lng, intensity: Math.round(intensity / stages.length) });
      }
    }

    res.json({ success: true, points });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/v1/demand/:id/actual
exports.updateActual = async (req, res) => {
  try {
    const { actualCount } = req.body;
    const demand = await PassengerDemand.findByIdAndUpdate(
      req.params.id, { actualCount }, { new: true }
    );
    if (!demand) return res.status(404).json({ success: false, message: 'Not found.' });
    res.json({ success: true, demand });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

function _peakFactor(hour) {
  const profile = [0.2,0.1,0.1,0.1,0.2,0.5,0.9,1.2,1.0,0.7,0.6,0.5,0.6,0.5,0.6,0.7,1.0,1.2,0.9,0.6,0.4,0.3,0.2,0.1];
  return +(profile[hour] || 0.5).toFixed(2);
}
