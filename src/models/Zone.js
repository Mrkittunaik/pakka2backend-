const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  areas: [{ type: String }], // area names covered by this zone
  active: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Zone', zoneSchema);
