/**
 * analytics.service.js
 * Aggregates trip data into daily Analytics documents.
 */

const Analytics   = require('../models/Analytics');
const TripHistory = require('../models/TripHistory');
const Alert       = require('../models/Alert');

async function aggregateDailyAnalytics(dateArg) {
  const date = dateArg ? new Date(dateArg) : new Date();
  date.setHours(0, 0, 0, 0);
  const nextDay = new Date(date.getTime() + 86400000);

  // Group trip histories by route
  const tripStats = await TripHistory.aggregate([
    { $match: { startTime: { $gte: date, $lt: nextDay } } },
    {
      $group: {
        _id:               '$route',
        totalTrips:        { $sum: 1 },
        completedTrips:    { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        cancelledTrips:    { $sum: { $cond: [{ $eq: ['$status', 'incomplete'] }, 1, 0] } },
        avgDelayMinutes:   { $avg: '$delayMinutes' },
        avgSpeed:          { $avg: '$avgSpeed' },
        onTimeTrips:       { $sum: { $cond: [{ $lte: ['$delayMinutes', 5] }, 1, 0] } },
      },
    },
  ]);

  for (const stat of tripStats) {
    const onTimePerf = stat.totalTrips > 0
      ? (stat.onTimeTrips / stat.totalTrips) * 100
      : 100;

    const alertCount = await Alert.countDocuments({
      route:     stat._id,
      createdAt: { $gte: date, $lt: nextDay },
    });
    const criticalCount = await Alert.countDocuments({
      route:     stat._id,
      severity:  'critical',
      createdAt: { $gte: date, $lt: nextDay },
    });

    await Analytics.findOneAndUpdate(
      { date, route: stat._id },
      {
        $set: {
          totalTrips:       stat.totalTrips,
          completedTrips:   stat.completedTrips,
          cancelledTrips:   stat.cancelledTrips,
          avgDelayMinutes:  Math.round(stat.avgDelayMinutes || 0),
          onTimePerformance:Math.round(onTimePerf),
          totalAlerts:      alertCount,
          criticalAlerts:   criticalCount,
        },
      },
      { upsert: true }
    );
  }

  console.log(`📊  Analytics aggregated for ${date.toDateString()}`);
}

module.exports = { aggregateDailyAnalytics };
