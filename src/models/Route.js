const mongoose = require('mongoose');

const routeSchema = new mongoose.Schema({
  url_route_id: { type: Number, required: true, unique: true, index: true },
  route_name:   { type: String, required: true, trim: true },
  start_stage:  { type: String, required: true, trim: true },
  end_stage:    { type: String, required: true, trim: true },
  distance_km:  { type: Number, required: true },
  url:          { type: String },
  total_stages: { type: Number, default: 0 },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

routeSchema.index({ route_name: 'text', start_stage: 'text', end_stage: 'text' });

module.exports = mongoose.model('Route', routeSchema);
