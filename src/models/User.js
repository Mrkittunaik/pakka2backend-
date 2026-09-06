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
  phone: {
    type: String,
    default: null,
    unique: true,
    sparse: true, // lets multiple Google-signup users have phone:null before they bind one
    index: true,
    validate: {
      validator: (v) => v === null || /^\d{10}$/.test(v),
      message: 'phone must be exactly 10 digits'
    }
  },
  email: { type: String, default: null },
  googleId: { type: String, default: null },
  addresses: [addressSchema],
  status: { type: String, enum: ['new', 'active', 'blocked'], default: 'new' },
  verified: { type: Boolean, default: false }, // admin has confirmed identity/KYC
  avatar: { type: String, default: '' },       // /uploads/<file> profile photo
  idProofUrl: { type: String, default: '' },   // /uploads/<file> ID card image, if collected
  ordersCount: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
