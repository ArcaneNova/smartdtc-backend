/**
 * demandPrediction.job.js
 * Hourly demand prediction via Python AI service (multi-model).
 * Uses real weather from Open-Meteo + Indian holiday calendar.
 */
const axios           = require('axios');
const PassengerDemand = require('../models/PassengerDemand');
const Route           = require('../models/Route');
const { getCurrentWeather } = require('../services/weather.service');
const { isHoliday }         = require('../utils/holidays');

const AI_URL = process.env.AI_SERVICE_URL || process.env.PYTHON_AI_URL || 'http://localhost:8000';

async function runDemandPrediction() {
  try {
    const routes = await Route.find({ isActive: true }).select('_id route_name');
    const now    = new Date();
    const hour   = now.getHours();
    const dow    = now.getDay();
    const date   = now.toISOString().split('T')[0];
    const isWeekend  = dow === 0 || dow === 6;
    const isHolidayToday = isHoliday(date);

    // Fetch real weather once for all routes
    const { weather, avg_temp_c } = await getCurrentWeather();

    let successCount = 0;
    let errorCount   = 0;

    for (const route of routes) {
      try {
        const { data } = await axios.post(
          `${AI_URL}/predict/demand`,
          {
            route_id:      route._id.toString(),
            date,
            hour,
            is_weekend:    isWeekend,
            is_holiday:    isHolidayToday,
            weather,
            avg_temp_c,
            special_event: false,
          },
          { timeout: 10000 }
        );

        // New API returns: predicted_count, crowd_level, model, confidence
        const predicted   = data.predicted_count ?? data.prediction?.predicted_count ?? 0;
        const crowdLevel  = data.crowd_level      ?? data.prediction?.crowd_level     ?? 'low';
        const modelUsed   = data.model            ?? data.prediction?.model            ?? 'unknown';

        if (predicted <= 0) continue;

        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        await PassengerDemand.findOneAndUpdate(
          { route: route._id, forDate: today, hour },
          {
            $set: {
              predictedCount: Math.round(predicted),
              crowdLevel,
              modelUsed,
              weather,
              avg_temp_c,
              isWeekend,
              isHoliday: isHolidayToday,
              predictedAt: now,
            },
          },
          { upsert: true, new: true }
        );
        successCount++;
      } catch (aiErr) {
        console.warn(`[DemandJob] AI call failed for route ${route._id}: ${aiErr.message}`);
        errorCount++;
      }
    }

    console.log(
      `[DemandJob] Hour ${hour}: ${successCount}/${routes.length} routes updated` +
      ` | weather=${weather} temp=${avg_temp_c}°C holiday=${isHolidayToday}` +
      (errorCount ? ` | ${errorCount} errors` : '')
    );
  } catch (err) {
    console.error('[DemandJob] Fatal error:', err.message);
  }
}

module.exports = { runDemandPrediction };
