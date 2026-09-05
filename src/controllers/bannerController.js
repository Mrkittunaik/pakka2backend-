const Banner = require('../models/Banner');
const emit = require('../sockets/emit');

exports.list = async (req, res) => res.json(await Banner.find({ active: true }).sort({ sortOrder: 1 }));
exports.listAll = async (req, res) => res.json(await Banner.find().sort({ sortOrder: 1 }));
exports.create = async (req, res) => {
  const doc = await Banner.create(req.body);
  emit.catalogChanged('banner', doc);
  res.status(201).json(doc);
};
exports.update = async (req, res) => {
  const b = await Banner.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!b) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('banner', b);
  res.json(b);
};
exports.remove = async (req, res) => {
  const b = await Banner.findByIdAndDelete(req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('banner', { _id: b._id, deleted: true });
  res.json({ ok: true });
};
