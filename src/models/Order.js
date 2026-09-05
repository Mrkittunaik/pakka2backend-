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
    enum: ['placed', 'preparing', 'out', 'delivered', 'cancelled'],
    default: 'placed'
  },
  assigned: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', default: null },
  couponCode: { type: String, default: null },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'cod'], default: 'pending' },
  paymentOrderId: { type: String, default: null }, // razorpay order id
  paymentRef: { type: String, default: null },     // razorpay payment id
  isSubscriptionDelivery: { type: Boolean, default: false },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
