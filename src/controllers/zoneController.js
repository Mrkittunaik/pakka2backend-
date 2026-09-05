const Zone = require('../models/Zone');
const emit = require('../sockets/emit');

exports.list = async (req, res) => res.json(await Zone.find().sort({ name: 1 }));
exports.create = async (req, res) => {
  const doc = await Zone.create(req.body);
  emit.catalogChanged('zone', doc);
  res.status(201).json(doc);
};
exports.update = async (req, res) => {
  const z = await Zone.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!z) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('zone', z);
  res.json(z);
};
exports.remove = async (req, res) => {
  const z = await Zone.findByIdAndDelete(req.params.id);
  if (!z) return res.status(404).json({ error: 'Not found' });
  emit.catalogChanged('zone', { _id: z._id, deleted: true });
  res.json({ ok: true });
};
