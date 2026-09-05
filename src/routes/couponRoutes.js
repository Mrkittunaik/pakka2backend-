const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/couponController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/validate', ctrl.validate); // public: customer checkout validation
router.get('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.list);
router.post('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.create);
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('owner', 'admin'), ctrl.remove);

module.exports = router;
