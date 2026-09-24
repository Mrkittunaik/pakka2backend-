const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/subscriptionController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../utils/upload');

router.post('/', requireAuth, requireRole('customer'), ctrl.create);
router.get('/', requireAuth, ctrl.list); // admin: all, customer: own
router.get('/:id', requireAuth, ctrl.getOne);
router.put('/:id', requireAuth, ctrl.update);
router.patch('/:id/pause', requireAuth, ctrl.pause);
router.patch('/:id/resume', requireAuth, ctrl.resume);
router.patch('/:id/payment-status', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.setPaymentStatus);

// Bottle-exchange delivery log + delivery-boy assignment
router.get('/:id/deliveries', requireAuth, ctrl.getDeliveries);
router.patch('/:id/assign-delivery-boy', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.assignDeliveryBoy);
router.post('/:id/log-delivery', requireAuth, requireRole('delivery'), upload.fields([{ name: 'newBottlePhoto' }, { name: 'oldBottlePhoto' }]), ctrl.logDelivery);

// Skip / unskip a single delivery date, cutoff-verified server-side
router.get('/:id/skip-window', requireAuth, ctrl.skipWindow);
router.post('/:id/skip', requireAuth, requireRole('customer'), ctrl.skipDate);
router.delete('/:id/skip/:date', requireAuth, requireRole('customer'), ctrl.unskipDate);

// Manually trigger today's delivery generation for a slot - same job the
// cron runs automatically. Useful for testing without waiting for the
// scheduled time, or backfilling after a missed run.
router.post('/generate-today', requireAuth, requireRole('owner', 'admin', 'manager'), async (req, res) => {
  const { slot } = req.body;
  if (!['morning', 'evening'].includes(slot)) return res.status(400).json({ error: 'slot must be "morning" or "evening"' });
  const { generateDeliveriesForSlot } = require('../utils/cron');
  const result = await generateDeliveriesForSlot(slot);
  res.json(result);
});

module.exports = router;
