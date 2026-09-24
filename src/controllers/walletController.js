const User = require('../models/User');
const WalletTransaction = require('../models/WalletTransaction');
const { applyWalletChange } = require('../utils/wallet');
const emit = require('../sockets/emit');

// GET /api/users/:id/wallet
exports.getWallet = async (req, res) => {
  if (req.auth.role === 'customer' && String(req.params.id) !== String(req.auth.id)) {
    return res.status(403).json({ error: 'Not your wallet' });
  }
  const user = await User.findById(req.params.id).select('walletBalance');
  if (!user) return res.status(404).json({ error: 'Not found' });
  res.json({ balance: user.walletBalance });
};

// GET /api/users/:id/wallet/transactions
exports.getTransactions = async (req, res) => {
  if (req.auth.role === 'customer' && String(req.params.id) !== String(req.auth.id)) {
    return res.status(403).json({ error: 'Not your wallet' });
  }
  res.json(await WalletTransaction.find({ customer: req.params.id }).sort({ createdAt: -1 }));
};

// POST /api/users/:id/wallet/adjust  { type: 'credit'|'debit', amount, reason }  (admin)
exports.adjust = async (req, res) => {
  const { type, amount, reason } = req.body;
  const { balance, transaction } = await applyWalletChange({
    customerId: req.params.id,
    type, amount, reason,
    createdBy: `${req.auth.role}:${req.auth.id}`
  });
  emit.walletChanged({ customer: req.params.id, balance, transaction }); // -> admins room + user:<id> room
  res.json({ balance, transaction });
};
