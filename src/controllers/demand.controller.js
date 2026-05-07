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
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      const hour    = Number(payload?.hour ?? 12);
      const profile = [2,1,1,1,2,5,9,12,10,7,6,5,6,5,6,7,10,12,9,6,4,3,2,1];
      const base    = profile[hour] * 12;
      const pred    = Math.max(5, base + Math.floor(Math.random() * 20 - 10));
      const level   = pred > 120 ? 'critical' : pred > 80 ? 'high' : pred > 40 ? 'medium' : 'low';
      return res.status(200).json({
        success: true,
        prediction: {
          predicted_count: pred,
          crowd_level:     level,
          confidence:      0.65,
          model:           'rule_based_fallback',
          is_best:         false,
          metrics:         null,
          peak_factor:     _peakFactor(hour),
        },
        warning: 'AI service unavailable — using fallback model',
      });
    }
    if (err.response) {
      return res.status(502).json({ success: false, message: 'AI service error', detail: err.response.data });
    }
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/v1/demand/predict/all-models
exports.predictDemandAllModels = async (req, res) => {
  try {
    const aiRes = await axios.post(`${AI_URL}/predict/demand/all-models`, req.body, { timeout: 30000 });
    res.status(200).json({ success: true, ...aiRes.data });
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(503).json({ success: false, message: 'AI service unavailable' });
    }
    res.status(500).json({ success: false, message: err.message });
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
