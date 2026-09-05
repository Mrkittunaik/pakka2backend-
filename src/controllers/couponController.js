const Coupon = require('../models/Coupon');
const emit = require('../sockets/emit');

exports.list = async (req, res) => res.json(await Coupon.find().sort({ createdAt: -1 }));
exports.create = async (req, res) => {
  req.body.code = String(req.body.code || '').toUpperCase();
  const c = await Coupon.create(req.body);
  emit.catalogChanged('coupon', c);
  res.status(201).json(c);
};
exports.update = async (req, res) => {
  const c = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!c) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('coupon', c);
  res.json(c);
};
exports.remove = async (req, res) => {
  const c = await Coupon.findByIdAndDelete(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('coupon', { _id: c._id, deleted: true });
  res.json({ ok: true });
};

// customer: validate a coupon against a cart total before checkout
exports.validate = async (req, res) => {
  const { code, total } = req.query;
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase(), active: true });
  if (!coupon) return res.status(404).json({ error: 'Invalid coupon' });
  if (coupon.expiry < new Date()) return res.status(400).json({ error: 'Coupon expired' });
  if (Number(total) < coupon.minOrder) return res.status(400).json({ error: `Minimum order ₹${coupon.minOrder} required` });
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return res.status(400).json({ error: 'Coupon usage limit reached' });

  let discount = coupon.type === 'flat' ? coupon.value : Math.round((coupon.value / 100) * Number(total));
  if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  res.json({ valid: true, discount });
};
