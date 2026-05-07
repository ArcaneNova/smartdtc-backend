const mongoose = require('mongoose');

const stageSchema = new mongoose.Schema({
  url_route_id: { type: Number, required: true, index: true },
  seq:          { type: Number, required: true },
  stage_id:     { type: Number, required: true, index: true },
  stage_name:   { type: String, required: true, trim: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
}, { timestamps: true });

stageSchema.index({ location: '2dsphere' });
stageSchema.index({ url_route_id: 1, seq: 1 });
stageSchema.index({ stage_name: 'text' });

module.exports = mongoose.model('Stage', stageSchema);
