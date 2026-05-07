const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  bus:            { type: mongoose.Schema.Types.ObjectId, ref: 'Bus' },
  route:          { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  schedule:       { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule' },
  bookingRef:     { type: String, required: true, unique: true },
  passengers:     { type: Number, default: 1, min: 1, max: 10 },
  boardingStop:   { type: String, default: '' },
  dropStop:       { type: String, default: '' },
  toStop:         { type: String, default: '' },   // alias for scan-to-board
  seatPreference: { type: String, enum: ['any', 'window', 'aisle'], default: 'any' },
  seatNumbers:    [{ type: String }],              // e.g. ['1W', '1A'] — auto-assigned
  status:         { type: String, enum: ['confirmed', 'boarded', 'cancelled', 'completed'], default: 'confirmed' },
  fare:           { type: Number, default: 0 },
  paymentId:      { type: String },
  paymentMode:    { type: String, enum: ['online', 'cash', 'pass'], default: 'online' },
  bookedAt:       { type: Date, default: Date.now },
  expiresAt:      { type: Date },                  // 90-min scan-to-board validity
}, { timestamps: true });

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ schedule: 1, status: 1 });
// Note: bookingRef unique index is defined via schema field above — no duplicate index needed

module.exports = mongoose.model('Booking', bookingSchema);
