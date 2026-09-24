const BottleTicket = require('../models/BottleTicket');
const { applyWalletChange } = require('../utils/wallet');
const emit = require('../sockets/emit');

// POST /api/bottle-tickets  (delivery app, multipart: photo, body: customer, note)
exports.create = async (req, res) => {
  const { customer, note } = req.body;
  if (!customer) return res.status(400).json({ error: 'customer is required' });
  const ticket = await BottleTicket.create({
    customer,
    deliveryBoy: req.auth.id,
    photo: req.file ? req.file.path : undefined,
    note
  });
  const populated = await ticket.populate([{ path: 'customer' }, { path: 'deliveryBoy' }]);
  emit.bottleTicketChanged(populated);
  res.status(201).json(populated);
};

// GET /api/bottle-tickets?status=open  (admin)
exports.list = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;
  res.json(
    await BottleTicket.find(filter)
      .populate('customer')
      .populate('deliveryBoy')
      .sort({ createdAt: -1 })
  );
};

// PATCH /api/bottle-tickets/:id/resolve  { status, deductedAmount, adminNote }  (admin)
exports.resolve = async (req, res) => {
  const { status, deductedAmount, adminNote } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status must be 'approved' or 'rejected'" });
  }

  const ticket = await BottleTicket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Not found' });
  if (ticket.status !== 'open') return res.status(409).json({ error: 'Ticket already resolved' });

  const resolvedBy = `${req.auth.role}:${req.auth.id}`;
  const amount = Number(deductedAmount) || 0;

  // Same atomic debit + ledger logic as walletController.adjust
  let walletResult = null;
  if (status === 'approved' && amount > 0) {
    walletResult = await applyWalletChange({
      customerId: ticket.customer,
      type: 'debit',
      amount,
      reason: 'Broken bottle deduction',
      relatedTicket: ticket._id,
      createdBy: resolvedBy
    });
  }

  ticket.status = status;
  ticket.deductedAmount = status === 'approved' ? amount : 0;
  ticket.adminNote = adminNote;
  ticket.resolvedBy = resolvedBy;
  ticket.resolvedAt = new Date();
  await ticket.save();

  const populated = await ticket.populate([{ path: 'customer' }, { path: 'deliveryBoy' }]);
  if (walletResult) {
    emit.walletChanged({ customer: ticket.customer, balance: walletResult.balance, transaction: walletResult.transaction });
  }
  emit.bottleTicketChanged(populated);
  res.json(populated);
};
