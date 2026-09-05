const Payment = require('../models/Payment');
const Order = require('../models/Order');
const emit = require('../sockets/emit');

// admin: payment manager listing + monthly stats
exports.list = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  res.json(await Payment.find(filter).populate('customer', 'name phone').sort({ createdAt: -1 }));
};

exports.stats = async (req, res) => {
  const payments = await Payment.find();
  const byMonth = {};
  for (const p of payments) {
    const key = `${p.createdAt.getFullYear()}-${String(p.createdAt.getMonth() + 1).padStart(2, '0')}`;
    byMonth[key] = byMonth[key] || { paid: 0, due: 0, overdue: 0, count: 0 };
    byMonth[key][p.status] = (byMonth[key][p.status] || 0) + p.amount;
    byMonth[key].count += 1;
  }
  res.json(byMonth);
};

exports.markStatus = async (req, res) => {
  const { status } = req.body;
  const p = await Payment.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.order) await Order.findByIdAndUpdate(p.order, { paymentStatus: status === 'paid' ? 'paid' : 'pending' });
  emit.paymentChanged(p); // -> customer sees payment verified/settled live, admin ledger updates too
  res.json(p);
};
