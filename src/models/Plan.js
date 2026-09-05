const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: { type: String, required: true },
  duration: { type: String, enum: ['weekly', 'monthly', 'sixmonth'], required: true },
  qty: { type: String, enum: ['half', 'one', 'two'], required: true },
  slot: { type: String, enum: ['morning', 'evening'], default: 'morning' },
  price: { type: Number, required: true },
  subs: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);
