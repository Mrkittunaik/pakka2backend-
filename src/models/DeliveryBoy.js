const mongoose = require('mongoose');

const deliveryBoySchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true, unique: true, index: true },
  passwordHash: { type: String }, // set once approved / self-registered
  area: { type: String, default: '' },
  zone: { type: String, default: '' },
  vehicle: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'suspended', 'rejected'], default: 'pending' },
  deliveries: { type: Number, default: 0 },
  rating: { type: Number, default: null },
  liveLocation: {
    lat: Number,
    lng: Number,
    updatedAt: Date
  },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('DeliveryBoy', deliveryBoySchema);
