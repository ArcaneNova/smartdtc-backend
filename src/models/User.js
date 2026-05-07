const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:         { type: String, required: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:     { type: String, required: true, minlength: 6, select: false },
  role:         { type: String, enum: ['admin', 'dispatcher', 'driver', 'passenger'], default: 'passenger' },
  phone:        { type: String, trim: true },
  profileImage: { type: String, default: '' },
  isActive:     { type: Boolean, default: true },
  resetPasswordToken:   { type: String, select: false },
  resetPasswordExpire:  { type: Date, select: false },
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
