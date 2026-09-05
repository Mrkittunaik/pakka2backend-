const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/staffController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('owner', 'admin'), ctrl.list);
router.post('/', requireAuth, requireRole('owner', 'admin'), ctrl.create);
router.put('/:id', requireAuth, requireRole('owner', 'admin'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('owner'), ctrl.remove);

module.exports = router;
