/**
 * scheduler.service.js
 * Cron-based background jobs:
 *  - GPS simulation every 10 seconds
 *  - Schedule status updater every minute
 *  - Demand prediction every hour
 *  - Schedule optimization every night at 02:00
 *  - Daily analytics aggregation at midnight
 */

const cron        = require('node-cron');
const { runSimulation }          = require('./gpsSimulator');
const analyticsService           = require('./analytics.service');
const scheduleService            = require('./scheduleStatus.service');
const { runDemandPrediction }    = require('../jobs/demandPrediction.job');
const { runScheduleOptimization } = require('../jobs/scheduleOptimize.job');

function startCronJobs() {
  // GPS simulation every 10 seconds (demo mode only)
  if (process.env.ENABLE_GPS_SIMULATOR === 'true') {
    cron.schedule('*/10 * * * * *', () => {
      runSimulation().catch(console.error);
    });
  } else {
    console.log('ℹ️  GPS simulator cron disabled (live driver GPS only)');
  }

  // Update schedule statuses every minute
  cron.schedule('* * * * *', () => {
    scheduleService.updateScheduleStatuses().catch(console.error);
  });

  // Hourly demand predictions
  cron.schedule('0 * * * *', () => {
    runDemandPrediction().catch(console.error);
  });

  // Nightly schedule optimization at 02:00
  cron.schedule('0 2 * * *', () => {
    runScheduleOptimization().catch(console.error);
  });

  // Aggregate daily analytics at midnight
  cron.schedule('0 0 * * *', () => {
    analyticsService.aggregateDailyAnalytics().catch(console.error);
  });

  console.log('⏰  Cron jobs started');
}

module.exports = { startCronJobs };
