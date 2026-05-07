const mongoose = require('mongoose');

const passengerDemandSchema = new mongoose.Schema({
  route:          { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  stage:          { type: mongoose.Schema.Types.ObjectId, ref: 'Stage' },
  forDate:        { type: Date, required: true },
  hour:           { type: Number, min: 0, max: 23, required: true },
  predictedCount: { type: Number, default: 0 },
  actualCount:    { type: Number, default: null },
  crowdLevel:     { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'low' },
  weather:        { type: String, default: 'clear' },
  isWeekend:      { type: Boolean, default: false },
  isHoliday:      { type: Boolean, default: false },
  modelUsed:      { type: String, default: 'unknown' },
  predictedAt:    { type: Date, default: Date.now },
}, { timestamps: true });

passengerDemandSchema.index({ route: 1, forDate: 1, hour: 1 });

module.exports = mongoose.model('PassengerDemand', passengerDemandSchema);
