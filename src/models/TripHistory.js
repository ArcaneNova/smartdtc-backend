const mongoose = require('mongoose');

const tripHistorySchema = new mongoose.Schema({
  driver:         { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', required: true },
  bus:            { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
  route:          { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  schedule:       { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule' },
  startTime:      { type: Date, required: true },
  endTime:        { type: Date },
  distanceCovered:{ type: Number, default: 0 }, // km
  stopsCompleted: { type: Number, default: 0 },
  totalStops:     { type: Number, default: 0 },
  avgSpeed:       { type: Number, default: 0 }, // km/h
  delayMinutes:   { type: Number, default: 0 },
  incidents:      [{ type: String }],
  fare:           { type: Number, default: 0 },       // INR collected
  passengerCount: { type: Number, default: 0 },       // passengers served
  onTimeStatus:   { type: String, enum: ['on-time', 'delayed', 'early'], default: 'on-time' },
  rating: {
    overall:  { type: Number, min: 1, max: 5 },
    driver:   { type: Number, min: 1, max: 5 },
    comfort:  { type: Number, min: 1, max: 5 },
    tags:     [{ type: String }],
    comment:  { type: String },
    ratedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    ratedAt:  { type: Date },
  },
  status: {
    type: String,
    enum: ['completed', 'incomplete', 'emergency-stopped'],
    default: 'incomplete',
  },
}, { timestamps: true });

tripHistorySchema.index({ driver: 1, startTime: -1 });
tripHistorySchema.index({ bus: 1, startTime: -1 });
tripHistorySchema.index({ route: 1, startTime: -1 });

module.exports = mongoose.model('TripHistory', tripHistorySchema);
