const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  code: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } }, // TTL index: MongoDB auto-deletes once expiresAt passes
  consumed: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Otp', otpSchema);
