const bcrypt = require('bcryptjs');
const Staff = require('../models/Staff');

exports.list = async (req, res) => res.json(await Staff.find().select('-passwordHash').sort({ createdAt: -1 }));

exports.create = async (req, res) => {
  const { name, email, password, role } = req.body;
  const existing = await Staff.findOne({ email });
  if (existing) return res.status(409).json({ error: 'Email already in use' });
  const passwordHash = await bcrypt.hash(password, 10);
  const staff = await Staff.create({ name, email, passwordHash, role });
  res.status(201).json({ id: staff._id, name: staff.name, email: staff.email, role: staff.role });
};

exports.update = async (req, res) => {
  const { name, role, active } = req.body;
  const staff = await Staff.findByIdAndUpdate(req.params.id, { name, role, active }, { new: true }).select('-passwordHash');
  if (!staff) return res.status(404).json({ error: 'Not found' });
  res.json(staff);
};

exports.remove = async (req, res) => {
  const staff = await Staff.findByIdAndDelete(req.params.id);
  if (!staff) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};
