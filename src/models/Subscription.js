const mongoose = require('mongoose');

const customDaysSchema = new mongoose.Schema({
  mon: { type: String, enum: ['none', 'half', 'one', 'two'], default: 'none' },
  tue: { type: String, enum: ['none', 'half', 'one', 'two'], default: 'none' },
  wed: { type: String, enum: ['none', 'half', 'one', 'two'], default: 'none' },
  thu: { type: String, enum: ['none', 'half', 'one', 'two'], default: 'none' },
  fri: { type: String, enum: ['none', 'half', 'one', 'two'], default: 'none' },
  sat: { type: String, enum: ['none', 'half', 'one', 'two'], default: 'none' },
  sun: { type: String, enum: ['none', 'half', 'one', 'two'], default: 'none' }
}, { _id: false });

const subscriptionSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  address: { type: String, required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
  custom: { type: customDaysSchema, default: null }, // used when plan is null
  slot: { type: String, enum: ['morning', 'evening'], default: 'morning' },
  startDate: { type: Date, required: true },
  active: { type: Boolean, default: true },
  paymentStatus: { type: String, enum: ['paid', 'due', 'overdue'], default: 'due' },
  // Dates the customer has skipped, e.g. ["2026-09-08"]. Stored as YYYY-MM-DD
  // strings (not Date) so there's no timezone ambiguity about which calendar
  // day was skipped.
  skippedDates: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
