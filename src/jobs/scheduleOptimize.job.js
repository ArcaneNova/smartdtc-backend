/**
 * scheduleOptimize.job.js
 * Nightly headway optimization via Python AI service.
 * Uses real weather + Indian holiday calendar for tomorrow.
 * Called by scheduler.service.js cron at 02:00 every night.
 */
const axios    = require('axios');
const Schedule = require('../models/Schedule');
const Route    = require('../models/Route');
const PassengerDemand = require('../models/PassengerDemand');
const { getCurrentWeather } = require('../services/weather.service');
const { isHoliday }         = require('../utils/holidays');

const AI_URL = process.env.AI_SERVICE_URL || process.env.PYTHON_AI_URL || 'http://localhost:8000';

/**
 * runScheduleOptimization
 * For each active route, fetches tomorrow's scheduled trips,
 * asks the AI to suggest optimal headways, and updates the schedule.
 */
async function runScheduleOptimization() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const dayEnd = new Date(tomorrow);
    dayEnd.setHours(23, 59, 59, 999);

    const tomorrowStr   = tomorrow.toISOString().split('T')[0];
    const isWeekend     = tomorrow.getDay() === 0 || tomorrow.getDay() === 6;
    const isHolidayTomorrow = isHoliday(tomorrowStr);
    const { weather, avg_temp_c } = await getCurrentWeather();

    const routes = await Route.find({ isActive: true }).select('_id route_name url_route_id');

    for (const route of routes) {
      const schedules = await Schedule.find({
        route:  route._id,
        date:   { $gte: tomorrow, $lte: dayEnd },
        status: 'scheduled',
      }).select('_id departureTime estimatedArrivalTime frequency_minutes');

      if (schedules.length < 2) continue;

      // Get demand predictions for tomorrow peak hours (8, 17) to weight headways
      const peakDemands = await PassengerDemand.find({
        route: route._id,
        forDate: { $gte: tomorrow, $lte: dayEnd },
        hour: { $in: [8, 9, 17, 18, 19] },
      }).select('hour predictedCount').lean();

      const demandByHour = {};
      peakDemands.forEach(d => { demandByHour[d.hour] = d.predictedCount; });

      // Build current headway list
      const sortedSchedules = schedules
        .slice()
        .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());
      const sortedTimes = sortedSchedules.map(s => new Date(s.departureTime).getTime());

      const currentHeadways = [];
      const passengerDemand = [];
      for (let i = 1; i < sortedTimes.length; i++) {
        currentHeadways.push(Math.round((sortedTimes[i] - sortedTimes[i - 1]) / 60000));
        const h = new Date(sortedTimes[i]).getHours();
        passengerDemand.push(demandByHour[h] || 100);
      }

      // Ask AI for optimized headways with enriched context
      let optimized = null;
      try {
        const { data } = await axios.post(`${AI_URL}/optimize/headway`, {
          route_id:         route._id.toString(),
          date:             tomorrowStr,
          fleet_size:       schedules.length,
          is_weekend:       isWeekend,
          is_holiday:       isHolidayTomorrow,
          weather,
          avg_temp_c,
          current_headways: currentHeadways,
          passenger_demand: passengerDemand,
          peak_hours:       [8, 9, 17, 18, 19],
        }, { timeout: 15000 });

        optimized = data.optimized_headways;
      } catch (aiErr) {
        console.warn(`[ScheduleJob] AI call failed for route ${route._id}: ${aiErr.message}`);
        continue;
      }

      if (!Array.isArray(optimized) || optimized.length !== currentHeadways.length) continue;

      let baseTime = sortedTimes[0];
      for (let i = 1; i < sortedSchedules.length; i++) {
        baseTime += optimized[i - 1] * 60000;
        const tripDuration = new Date(sortedSchedules[i].estimatedArrivalTime).getTime() - new Date(sortedSchedules[i].departureTime).getTime();
        await Schedule.findByIdAndUpdate(sortedSchedules[i]._id, {
          $set: {
            departureTime:        new Date(baseTime),
            estimatedArrivalTime: new Date(baseTime + tripDuration),
            frequency_minutes:    optimized[i - 1],
            generatedBy:          'ai-auto',
          },
        });
      }
    }

    console.log(`[ScheduleJob] Optimization complete for ${routes.length} routes | weather=${weather} holiday=${isHolidayTomorrow}`);
  } catch (err) {
    console.error('[ScheduleJob] Fatal error:', err.message);
  }
}

module.exports = { runScheduleOptimization };
