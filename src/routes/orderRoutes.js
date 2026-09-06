const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.post('/', requireAuth, requireRole('customer'), ctrl.create);
router.get('/', requireAuth, ctrl.list); // admin sees all, customer sees own, delivery sees assigned
router.get('/:id', requireAuth, ctrl.getOne);
router.patch('/:id/status', requireAuth, requireRole('owner', 'admin', 'manager', 'delivery'), ctrl.updateStatus);
router.patch('/:id/assign', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.assign);
router.patch('/:id/offer', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.offer);
router.patch('/:id/respond', requireAuth, requireRole('delivery'), ctrl.respond);

module.exports = router;
