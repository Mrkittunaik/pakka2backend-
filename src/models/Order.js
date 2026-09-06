const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  qty: Number,
  price: Number
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderCode: { type: String, required: true, unique: true }, // e.g. PD1042
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: String,
  phone: String,
  address: String,
  lat: Number,
  lng: Number,
  items: [orderItemSchema],
  total: { type: Number, required: true },
  discount: { type: Number, default: 0 },
  status: {
    type: String,
    // pending_acceptance: broadcast to nearby delivery boys, awaiting first accept
    // out: accepted by a delivery boy, en route
    enum: ['placed', 'preparing', 'pending_acceptance', 'out', 'delivered', 'cancelled'],
    default: 'placed'
  },
  assigned: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', default: null },
  // Delivery boys the order was broadcast to when offered (audit trail + lets us
  // tell late responders "already taken" instead of a confusing generic error).
  offeredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy' }],
  offeredAt: { type: Date, default: null },
  rejectedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy' }],
  acceptedAt: { type: Date, default: null },
  slot: { type: String, enum: ['morning', 'evening', null], default: null }, // per-order delivery slot (one-off orders)
  couponCode: { type: String, default: null },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'cod'], default: 'pending' },
  paymentOrderId: { type: String, default: null }, // razorpay order id
  paymentRef: { type: String, default: null },     // razorpay payment id
  isSubscriptionDelivery: { type: Boolean, default: false },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
