const bcrypt = require('bcryptjs');
const DeliveryBoy = require('../models/DeliveryBoy');
const emit = require('../sockets/emit');

exports.list = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  res.json(await DeliveryBoy.find(filter).sort({ createdAt: -1 }));
};

exports.getOne = async (req, res) => {
  const d = await DeliveryBoy.findById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
};

// PATCH /api/delivery-boys/:id/status  { status: pending|approved|suspended|rejected } (admin)
exports.setStatus = async (req, res) => {
  const { status } = req.body;
  const d = await DeliveryBoy.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!d) return res.status(404).json({ error: 'Not found' });
  emit.driverStatusChanged(d); // -> delivery app instantly unlocks/locks on approve/suspend, no re-login needed
  res.json(d);
};

// PATCH /api/delivery-boys/me/location  { lat, lng } (delivery app, live tracking - REST fallback;
// the socket 'driver:location' event is the low-latency path used while an order is "out")
exports.updateMyLocation = async (req, res) => {
  const { lat, lng } = req.body;
  const d = await DeliveryBoy.findByIdAndUpdate(
    req.auth.id,
    { liveLocation: { lat, lng, updatedAt: new Date() } },
    { new: true }
  );
  emit.driverUpdated(d);
  res.json(d);
};

exports.me = async (req, res) => {
  const d = await DeliveryBoy.findById(req.auth.id);
  if (!d) return res.status(404).json({ error: 'Account not found' });
  res.json(d);
};

exports.update = async (req, res) => {
  const d = await DeliveryBoy.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json(d);
};

exports.changePassword = async (req, res) => {
  const { password } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const d = await DeliveryBoy.findByIdAndUpdate(req.params.id, { passwordHash }, { new: true });
  if (!d) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
};
