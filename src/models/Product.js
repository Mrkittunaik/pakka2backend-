const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  unit: { type: String, required: true },      // '500ml', '1L', '200g'...
  category: { type: String, required: true },  // Category.key
  price: { type: Number, required: true },
  mrp: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  desc: { type: String, default: '' },
  available: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  sold: { type: Number, default: 0 },
  images: [{ type: String }] // file URLs served from /uploads
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
