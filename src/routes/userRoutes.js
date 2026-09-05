const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const authCtrl = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.list);
router.get('/me', requireAuth, requireRole('customer'), ctrl.me);
router.put('/me', requireAuth, requireRole('customer'), ctrl.updateMe);
router.post('/me/addresses', requireAuth, requireRole('customer'), ctrl.addAddress);
router.delete('/me/addresses/:addrId', requireAuth, requireRole('customer'), ctrl.removeAddress);
router.get('/:id/status', authCtrl.userStatus); // matches GET /api/users/:id/status from frontend
router.get('/:id', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.getOne);
router.patch('/:id/status', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.setStatus);

module.exports = router;
