const mongoose = require('mongoose');

// Ledger row for every change to User.walletBalance. A balance must never be
// changed without one of these being written (see utils/wallet.js).
const walletTransactionSchema = new mongoose.Schema({
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  reason: { type: String, required: true },
  relatedTicket: { type: mongoose.Schema.Types.ObjectId, ref: 'BottleTicket', default: null },
  createdBy: { type: String } // "<role>:<id>" of whoever made the change
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
