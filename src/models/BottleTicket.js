const mongoose = require('mongoose');

// Raised by a delivery boy (e.g. broken / missing bottle); resolved by admin.
const bottleTicketSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', required: true },
  photo: { type: String },
  note: { type: String },
  status: { type: String, enum: ['open', 'approved', 'rejected'], default: 'open' },
  deductedAmount: { type: Number, default: 0 },
  adminNote: { type: String },
  resolvedBy: { type: String },
  resolvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('BottleTicket', bottleTicketSchema);
