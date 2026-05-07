const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  licenseNo:     { type: String, required: true, unique: true, trim: true },
  experience:    { type: Number, default: 0 }, // years
  assignedBus:   { type: mongoose.Schema.Types.ObjectId, ref: 'Bus', default: null },
  assignedRoute: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', default: null },
  status:        { type: String, enum: ['on-duty', 'off-duty', 'on-leave'], default: 'off-duty' },
  rating:        { type: Number, default: 5.0, min: 1, max: 5 },
  totalTrips:    { type: Number, default: 0 },
  dutyHoursToday:{ type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Driver', driverSchema);
