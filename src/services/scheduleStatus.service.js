/**
 * scheduleStatus.service.js
 * Automatically transition schedule statuses based on current time.
 */

const Schedule = require('../models/Schedule');

async function updateScheduleStatuses() {
  const now = new Date();

  // Mark in-progress
  await Schedule.updateMany(
    { status: 'scheduled', departureTime: { $lte: now }, estimatedArrivalTime: { $gt: now } },
    { $set: { status: 'in-progress' } }
  );

  // Mark completed
  await Schedule.updateMany(
    { status: 'in-progress', estimatedArrivalTime: { $lte: now } },
    { $set: { status: 'completed' } }
  );
}

module.exports = { updateScheduleStatuses };
