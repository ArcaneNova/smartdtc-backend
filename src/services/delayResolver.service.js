/**
 * delayResolver.service.js
 * Cascade delay propagation — when one bus on a route is delayed,
 * automatically updates subsequent scheduled trips on the same route
 * and emits socket events for real-time UI updates.
 *
 * Algorithm:
 *  1. Receive a delay event (busId, routeId, delayMinutes)
 *  2. Find all future schedules for the same route today
 *  3. Shift their departure + arrival times by the cascade fraction
 *  4. Emit 'schedule:delay' via Socket.io to connected admins
 *  5. Notify affected passengers (optional)
 */

const Schedule = require('../models/Schedule');
const Alert    = require('../models/Alert');

/**
 * Resolve and cascade a delay through the schedule.
 *
 * @param {object} opts
 * @param {string} opts.busId
 * @param {string} opts.routeId
 * @param {number} opts.delayMinutes
 * @param {string} opts.scheduleId      The current trip's schedule document _id
 * @param {object} opts.io              Socket.io server instance
 */
const resolveDelay = async ({ busId, routeId, delayMinutes, scheduleId, io }) => {
  if (!routeId || !delayMinutes || delayMinutes < 5) return; // ignore trivial delays

  try {
    const now   = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86_400_000);

    // Find upcoming trips for this route (after the current one)
    const upcoming = await Schedule.find({
      route:         routeId,
      _id:           { $ne: scheduleId },
      status:        { $in: ['scheduled', 'in-progress'] },
      departureTime: { $gte: now, $lt: tomorrow },
    }).sort({ departureTime: 1 }).limit(10);

    // Cascade fraction: each subsequent trip absorbs a smaller portion
    const updates = [];
    let   cascadedDelay = delayMinutes;

    for (const trip of upcoming) {
      if (cascadedDelay < 1) break;

      const shift = Math.round(cascadedDelay);
      const newDep = new Date(trip.departureTime.getTime() + shift * 60_000);
      const newArr = trip.arrivalTime
        ? new Date(trip.arrivalTime.getTime() + shift * 60_000)
        : null;

      updates.push(
        Schedule.findByIdAndUpdate(trip._id, {
          departureTime: newDep,
          ...(newArr && { arrivalTime: newArr }),
          delayMinutes: (trip.delayMinutes || 0) + shift,
        }, { new: true })
      );

      // Emit per-trip delay event
      if (io) {
        io.to(`route:${routeId}`).emit('schedule:delay', {
          scheduleId: trip._id,
          routeId,
          delayMinutes: shift,
          newDepartureTime: newDep,
        });
      }

      cascadedDelay = cascadedDelay * 0.5; // decay by 50% for each subsequent trip
    }

    await Promise.all(updates);

    // Create a system alert if delay is significant
    if (delayMinutes >= 15) {
      await Alert.create({
        type:        'delay',
        message:     `Route delay cascade: ${delayMinutes} min delay affecting ${upcoming.length} upcoming trips.`,
        severity:    delayMinutes >= 30 ? 'critical' : 'warning',
        route:       routeId,
        bus:         busId,
        isResolved:  false,
      });

      // Broadcast alert to admin room
      if (io) {
        io.to('admin').emit('alert:new', {
          type:         'delay',
          delayMinutes,
          routeId,
          affectedTrips: upcoming.length,
        });
      }
    }

    console.log(`[DelayResolver] Route ${routeId}: ${delayMinutes}min delay cascaded to ${updates.length} trips`);
    return { cascaded: updates.length, delayMinutes };
  } catch (err) {
    console.error('[DelayResolver] Error:', err.message);
    return null;
  }
};

module.exports = { resolveDelay };
