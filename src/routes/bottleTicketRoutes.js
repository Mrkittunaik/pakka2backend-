const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bottleTicketController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../utils/upload');

router.post('/', requireAuth, requireRole('delivery'), upload.single('photo'), ctrl.create);
router.get('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.list);
router.patch('/:id/resolve', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.resolve);

module.exports = router;
