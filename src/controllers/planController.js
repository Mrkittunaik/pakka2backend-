const Plan = require('../models/Plan');
const emit = require('../sockets/emit');

exports.list = async (req, res) => res.json(await Plan.find({ active: true }).sort({ price: 1 }));
exports.listAll = async (req, res) => res.json(await Plan.find().sort({ price: 1 }));
exports.create = async (req, res) => {
  const doc = await Plan.create(req.body);
  emit.catalogChanged('plan', doc);
  res.status(201).json(doc);
};
exports.update = async (req, res) => {
  const p = await Plan.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!p) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('plan', p);
  res.json(p);
};
exports.remove = async (req, res) => {
  const p = await Plan.findByIdAndDelete(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('plan', { _id: p._id, deleted: true });
  res.json({ ok: true });
};
