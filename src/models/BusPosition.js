const mongoose = require('mongoose');

const busPositionSchema = new mongoose.Schema({
  bus:           { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
  route:         { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  schedule:      { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule' },
  location: {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  speed:         { type: Number, default: 0 }, // km/h
  heading:       { type: Number, default: 0 }, // degrees 0-360
  nextStage:     { type: mongoose.Schema.Types.ObjectId, ref: 'Stage' },
  etaNextStage:  { type: Date },
  delay_minutes: { type: Number, default: 0 },
  passenger_load: { type: Number, default: 0 }, // % of bus capacity currently occupied
  timestamp:     { type: Date, default: Date.now },
  isSimulated:   { type: Boolean, default: false },
});

busPositionSchema.index({ location: '2dsphere' });
busPositionSchema.index({ timestamp: 1 }, { expireAfterSeconds: 3600 }); // auto-delete after 1hr
busPositionSchema.index({ bus: 1, timestamp: -1 });

module.exports = mongoose.model('BusPosition', busPositionSchema);
