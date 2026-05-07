const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  type:       { type: String, enum: ['delay', 'overcrowding', 'breakdown', 'route-change', 'traffic', 'sos'], required: true },
  severity:   { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
  route:      { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  bus:        { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
  driver:     { type: mongoose.Schema.Types.ObjectId, ref: 'Driver' },
  stage:      { type: mongoose.Schema.Types.ObjectId, ref: 'Stage' },
  message:    { type: String, required: true, trim: true },
  details:    { type: mongoose.Schema.Types.Mixed },
  isResolved: { type: Boolean, default: false },
  resolvedAt: { type: Date },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

alertSchema.index({ isResolved: 1, severity: 1, createdAt: -1 });
alertSchema.index({ route: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
