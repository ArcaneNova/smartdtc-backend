const mongoose = require('mongoose');
const crypto   = require('crypto');

const busSchema = new mongoose.Schema({
  busNumber:      { type: String, required: true, unique: true, trim: true },
  registrationNo: { type: String, required: true, unique: true, trim: true },
  model:          { type: String, default: 'Tata Marcopolo' },
  capacity:       { type: Number, default: 60 },
  type:           { type: String, enum: ['AC', 'non-AC', 'electric'], default: 'non-AC' },
  status:         { type: String, enum: ['active', 'idle', 'maintenance', 'retired'], default: 'idle' },
  // Unique QR token — printed on bus gate, immutable once generated
  busQrId:        { type: String, unique: true, sparse: true },
  currentRoute:   { type: mongoose.Schema.Types.ObjectId, ref: 'Route', default: null },
  currentDriver:  { type: mongoose.Schema.Types.ObjectId, ref: 'Driver', default: null },
  lastPosition: {
    lat:       { type: Number },
    lng:       { type: Number },
    speed:     { type: Number, default: 0 },
    timestamp: { type: Date },
  },
  fuelLevel:  { type: Number, default: 100, min: 0, max: 100 },
  mileage:    { type: Number, default: 0 },
  lastService:{ type: Date },
}, { timestamps: true });

// Auto-generate a unique QR token if not present
busSchema.pre('save', function(next) {
  if (!this.busQrId) {
    this.busQrId = `DTC-BUS-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
  }
  next();
});

module.exports = mongoose.model('Bus', busSchema);
