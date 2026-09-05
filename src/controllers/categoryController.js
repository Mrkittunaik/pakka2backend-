const Category = require('../models/Category');
const emit = require('../sockets/emit');

exports.list = async (req, res) => res.json(await Category.find({ active: true }).sort({ sortOrder: 1 }));
exports.listAll = async (req, res) => res.json(await Category.find().sort({ sortOrder: 1 }));
exports.create = async (req, res) => {
  const doc = await Category.create(req.body);
  emit.catalogChanged('category', doc);
  res.status(201).json(doc);
};
exports.update = async (req, res) => {
  const c = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!c) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('category', c);
  res.json(c);
};
exports.remove = async (req, res) => {
  const c = await Category.findByIdAndDelete(req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('category', { _id: c._id, deleted: true });
  res.json({ ok: true });
};
