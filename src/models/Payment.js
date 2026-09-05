const mongoose = require('mongoose');

// Payout/settlement record for admin Payment Manager screen
const paymentSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['paid', 'due', 'overdue', 'refunded'], default: 'due' },
  method: { type: String, enum: ['cod', 'razorpay', 'upi', 'card', 'other'], default: 'cod' },
  ref: { type: String, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
