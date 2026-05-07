const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
  user:           { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  expoPushToken:  { type: String, required: true, trim: true },
  platform:       { type: String, enum: ['android', 'ios'], required: true },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

pushTokenSchema.index({ user: 1 });
pushTokenSchema.index({ expoPushToken: 1 }, { unique: true });

module.exports = mongoose.model('PushToken', pushTokenSchema);
