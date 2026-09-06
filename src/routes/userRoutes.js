const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userController');
const authCtrl = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../utils/upload');

router.get('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.list);
router.get('/me', requireAuth, requireRole('customer'), ctrl.me);
router.put('/me', requireAuth, requireRole('customer'), ctrl.updateMe);
router.post('/me/addresses', requireAuth, requireRole('customer'), ctrl.addAddress);
router.delete('/me/addresses/:addrId', requireAuth, requireRole('customer'), ctrl.removeAddress);
router.get('/:id/status', authCtrl.userStatus); // matches GET /api/users/:id/status from frontend
router.get('/:id', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.getOne);
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.update);
router.patch('/:id/status', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.setStatus);
router.patch('/:id/verify', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.setVerified);
router.delete('/:id', requireAuth, requireRole('owner', 'admin'), ctrl.remove);
router.post('/:id/image', requireAuth, requireRole('owner', 'admin', 'manager'), upload.single('image'), ctrl.setImage);

module.exports = router;
