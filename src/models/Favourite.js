const mongoose = require('mongoose');

const favouriteSchema = new mongoose.Schema({
  user:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:   { type: String, enum: ['route', 'stop'], required: true },
  refId:  { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'refModel' },
  refModel:{ type: String, enum: ['Route', 'Stage'], required: true },
  label:  { type: String, trim: true, default: '' },
}, { timestamps: true });

favouriteSchema.index({ user: 1, type: 1 });
favouriteSchema.index({ user: 1, refId: 1 }, { unique: true });

module.exports = mongoose.model('Favourite', favouriteSchema);
