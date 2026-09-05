const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema({
  label: String, // Home / Work / Other
  address: { type: String, required: true },
  lat: Number,
  lng: Number,
  accuracy: Number,
  isDefault: { type: Boolean, default: false }
}, { _id: true, timestamps: true });

const userSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  phone: { type: String, required: true, unique: true, index: true },
  email: { type: String, default: null },
  googleId: { type: String, default: null },
  addresses: [addressSchema],
  status: { type: String, enum: ['new', 'active', 'blocked'], default: 'new' },
  ordersCount: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
