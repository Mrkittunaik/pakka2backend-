const Subscription = require('../models/Subscription');
const emit = require('../sockets/emit');
const { checkCutoff, dateKey } = require('../utils/subscriptionRules');

// customer: subscribe to a plan or a custom weekday schedule
exports.create = async (req, res) => {
  const { plan, custom, address, slot, startDate } = req.body;
  const sub = await Subscription.create({
    customer: req.auth.id,
    plan: plan || null,
    custom: custom || null,
    address, slot, startDate
  });
  const populated = await sub.populate('plan');
  emit.subscriptionChanged(populated); // -> admin's subscription list updates live, no refresh
  res.status(201).json(populated);
};

exports.list = async (req, res) => {
  const filter = {};
  if (req.auth.role === 'customer') filter.customer = req.auth.id;
  res.json(await Subscription.find(filter).populate('plan').sort({ createdAt: -1 }));
};

exports.getOne = async (req, res) => {
  const s = await Subscription.findById(req.params.id).populate('plan');
  if (!s) return res.status(404).json({ error: 'Not found' });
  res.json(s);
};

// admin or customer: edit schedule / plan / slot / address
exports.update = async (req, res) => {
  const s = await Subscription.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('plan');
  if (!s) return res.status(404).json({ error: 'Not found' });
  emit.subscriptionChanged(s); // -> keeps admin calendar and the customer's own app in sync either direction
  res.json(s);
};

exports.pause = async (req, res) => {
  const s = await Subscription.findByIdAndUpdate(req.params.id, { active: false }, { new: true }).populate('plan');
  if (!s) return res.status(404).json({ error: 'Not found' });
  emit.subscriptionChanged(s);
  res.json(s);
};

exports.resume = async (req, res) => {
  const s = await Subscription.findByIdAndUpdate(req.params.id, { active: true }, { new: true }).populate('plan');
  if (!s) return res.status(404).json({ error: 'Not found' });
  emit.subscriptionChanged(s);
  res.json(s);
};

// admin: mark a subscription's billing state (paid/due/overdue) - drives Payment Manager screen too
exports.setPaymentStatus = async (req, res) => {
  const { paymentStatus } = req.body;
  const s = await Subscription.findByIdAndUpdate(req.params.id, { paymentStatus }, { new: true }).populate('plan');
  if (!s) return res.status(404).json({ error: 'Not found' });
  emit.subscriptionChanged(s);
  res.json(s);
};

// customer: skip a specific delivery date, e.g. "skip tomorrow" / "skip next Tuesday".
// POST /api/subscriptions/:id/skip  { date: "2026-09-08" }
// Verified server-side against the cutoff time - the client can't bypass it
// by just hiding the button, since the same rule is enforced here.
exports.skipDate = async (req, res) => {
  const { date } = req.body;
  if (!date) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });

  const s = await Subscription.findById(req.params.id).populate('plan');
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (req.auth.role === 'customer' && String(s.customer) !== String(req.auth.id)) {
    return res.status(403).json({ error: 'Not your subscription' });
  }

  const check = checkCutoff(date, s.slot);
  if (!check.allowed) return res.status(400).json({ error: check.reason, cutoffAt: check.cutoffAt });

  const key = dateKey(date);
  if (!s.skippedDates.includes(key)) {
    s.skippedDates.push(key);
    await s.save();
  }

  emit.subscriptionChanged(s); // -> admin's delivery calendar drops that date for this customer instantly
  res.json({ ok: true, skipped: key, subscription: s });
};

// customer: undo a skip, same cutoff rule applies (can't un-skip after the cutoff either,
// since by then the dairy has already planned around the skip).
// DELETE /api/subscriptions/:id/skip/:date
exports.unskipDate = async (req, res) => {
  const { date } = req.params;
  const s = await Subscription.findById(req.params.id).populate('plan');
  if (!s) return res.status(404).json({ error: 'Not found' });
  if (req.auth.role === 'customer' && String(s.customer) !== String(req.auth.id)) {
    return res.status(403).json({ error: 'Not your subscription' });
  }

  const check = checkCutoff(date, s.slot);
  if (!check.allowed) return res.status(400).json({ error: check.reason, cutoffAt: check.cutoffAt });

  s.skippedDates = s.skippedDates.filter(d => d !== date);
  await s.save();

  emit.subscriptionChanged(s);
  res.json({ ok: true, subscription: s });
};

// Public-ish helper the customer app calls to decide whether to even show the
// skip button + what the deadline is, before attempting the real change.
// GET /api/subscriptions/:id/skip-window?date=2026-09-08
exports.skipWindow = async (req, res) => {
  const { date } = req.query;
  const s = await Subscription.findById(req.params.id);
  if (!s) return res.status(404).json({ error: 'Not found' });
  const check = checkCutoff(date, s.slot);
  res.json(check);
};
