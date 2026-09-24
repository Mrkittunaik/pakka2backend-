const mongoose = require('mongoose');

// One row per morning delivery visit on a subscription (bottle exchange log).
const subscriptionDeliverySchema = new mongoose.Schema({
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', required: true, index: true },
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', required: true },
  date: { type: Date, default: Date.now },
  newBottlePhoto: { type: String },
  oldBottlePhoto: { type: String },
  quantityCollected: { type: Number },
  shortfall: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('SubscriptionDelivery', subscriptionDeliverySchema);
