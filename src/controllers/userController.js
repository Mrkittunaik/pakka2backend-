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

// admin: edit a customer's own detail fields (name/email/phone) directly from the admin panel
exports.update = async (req, res) => {
  const { name, email, phone } = req.body;
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (email !== undefined) patch.email = email;
  if (phone !== undefined) patch.phone = phone;
  const u = await User.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  emit.userUpdated(u);
  res.json(u);
};

// admin: mark KYC/identity as verified (or revoke it) after checking the uploaded ID
exports.setVerified = async (req, res) => {
  const { verified } = req.body;
  const u = await User.findByIdAndUpdate(req.params.id, { verified: !!verified }, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  emit.userUpdated(u);
  res.json(u);
};

// admin: permanently remove a customer account
exports.remove = async (req, res) => {
  const u = await User.findByIdAndDelete(req.params.id);
  if (!u) return res.status(404).json({ error: 'Not found' });
  emit.userDeleted(u._id);
  res.json({ ok: true });
};

// admin or customer: attach an uploaded avatar / ID-proof image file to the account
exports.setImage = async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const field = req.body.field === 'idProof' ? 'idProofUrl' : 'avatar';
  const u = await User.findByIdAndUpdate(req.params.id, { [field]: `/uploads/${req.file.filename}` }, { new: true });
  if (!u) return res.status(404).json({ error: 'Not found' });
  emit.userUpdated(u);
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
