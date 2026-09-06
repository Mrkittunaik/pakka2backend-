const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bannerController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../utils/upload');

router.get('/', ctrl.list); // public: active banners for customer app home screen
router.get('/all', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.listAll);
router.post('/upload-image', requireAuth, requireRole('owner', 'admin', 'manager'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});
router.post('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.create);
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('owner', 'admin'), ctrl.remove);

module.exports = router;
