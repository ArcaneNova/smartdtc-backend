const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  route:                 { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
  bus:                   { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', required: true },
  driver:                { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  date:                  { type: Date, required: true },
  departureTime:         { type: Date, required: true },
  estimatedArrivalTime:  { type: Date, required: true },
  frequency_minutes:     { type: Number, default: 20 },
  type:                  { type: String, enum: ['regular', 'peak', 'express', 'emergency'], default: 'regular' },
  generatedBy:           { type: String, enum: ['manual', 'ai-auto', 'admin', 'emergency'], default: 'manual' },
  status:                { type: String, enum: ['scheduled', 'in-progress', 'completed', 'cancelled'], default: 'scheduled' },
  // AI-schedule enrichment fields
  direction:             { type: String, enum: ['outbound', 'return'] },
  bus_number:            { type: Number },
  trip_number:           { type: Number },
  crowdLevel:            { type: String, enum: ['low', 'medium', 'high', 'very_high'] },
  demand_score:          { type: Number },
  notes:                 { type: String, trim: true },
}, { timestamps: true });

scheduleSchema.index({ date: 1, route: 1, status: 1 });
scheduleSchema.index({ driver: 1, date: 1 });
scheduleSchema.index({ bus: 1, date: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
