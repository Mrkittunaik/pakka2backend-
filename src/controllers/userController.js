const User = require('../models/User');
const emit = require('../sockets/emit');

// admin: list all customers
exports.list = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  res.json(await User.find(filter).sort({ createdAt: -1 }));
};

exports.getOne = async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  res.json(u);
};

// customer: my profile
exports.me = async (req, res) => {
  const u = await User.findById(req.auth.id);
  if (!u) return res.status(404).json({ error: 'Account not found' });
  res.json(u);
};

exports.updateMe = async (req, res) => {
  const { name, email } = req.body;
  const u = await User.findByIdAndUpdate(req.auth.id, { name, email }, { new: true });
  res.json(u);
};

// admin: block/unblock/activate
exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const u = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  emit.userStatusChanged(u); // -> if blocked mid-session, user app can react immediately (e.g. force logout)
  res.json(u);
};

// customer: addresses
exports.addAddress = async (req, res) => {
  const u = await User.findById(req.auth.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  if (req.body.isDefault) u.addresses.forEach(a => { a.isDefault = false; });
  u.addresses.push(req.body);
  await u.save();
  res.status(201).json(u);
};

exports.removeAddress = async (req, res) => {
  const u = await User.findById(req.auth.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  u.addresses = u.addresses.filter(a => String(a._id) !== req.params.addrId);
  await u.save();
  res.json(u);
};
