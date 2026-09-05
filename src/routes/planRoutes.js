const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/planController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', ctrl.list); // public: active plans for customer app
router.get('/all', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.listAll);
router.post('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.create);
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('owner', 'admin'), ctrl.remove);

module.exports = router;
