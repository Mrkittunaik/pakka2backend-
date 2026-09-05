const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const gateway = require('../controllers/gatewayController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Admin payment manager
router.get('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.list);
router.get('/stats', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.stats);
router.patch('/:id/status', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.markStatus);

// Customer checkout gateway (matches frontend comments)
router.post('/create-order', requireAuth, requireRole('customer'), gateway.createOrder);
router.post('/verify', requireAuth, requireRole('customer'), gateway.verify);

module.exports = router;
