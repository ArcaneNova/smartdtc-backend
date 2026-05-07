/**
 * etaCalculator.js
 * Estimate arrival time at a stage given current position and speed.
 */

const haversine = require('./haversine');

/**
 * @param {number} currentLat
 * @param {number} currentLng
 * @param {Array}  remainingStages  - array of Stage docs with location.coordinates
 * @param {number} speedKmh         - current bus speed
 * @returns {Array} stages with eta (Date) attached
 */
function calculateETA(currentLat, currentLng, remainingStages, speedKmh = 20) {
  let cumTime = 0; // cumulative minutes
  let prevLat = currentLat;
  let prevLng = currentLng;

  return remainingStages.map((stage) => {
    const [lng, lat] = stage.location?.coordinates || [0, 0];
    const distKm = haversine(prevLat, prevLng, lat, lng);
    const minutes = speedKmh > 0 ? (distKm / speedKmh) * 60 : 0;
    cumTime += minutes;

    prevLat = lat;
    prevLng = lng;

    return {
      stageId:   stage._id,
      stageName: stage.stage_name,
      eta:       new Date(Date.now() + cumTime * 60000),
      distKm:    +distKm.toFixed(3),
    };
  });
}

module.exports = { calculateETA };
