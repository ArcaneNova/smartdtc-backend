const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
  date:               { type: Date, required: true },
  route:              { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  totalTrips:         { type: Number, default: 0 },
  completedTrips:     { type: Number, default: 0 },
  cancelledTrips:     { type: Number, default: 0 },
  avgDelayMinutes:    { type: Number, default: 0 },
  avgPassengerLoad:   { type: Number, default: 0 }, // % of capacity
  peakHour:           { type: Number, default: 8 }, // 0-23
  fuelConsumed:       { type: Number, default: 0 }, // litres
  costSaved:          { type: Number, default: 0 }, // INR
  onTimePerformance:  { type: Number, default: 100 }, // % trips on time
  totalAlerts:        { type: Number, default: 0 },
  criticalAlerts:     { type: Number, default: 0 },
}, { timestamps: true });

analyticsSchema.index({ date: 1, route: 1 }, { unique: true });

module.exports = mongoose.model('Analytics', analyticsSchema);
