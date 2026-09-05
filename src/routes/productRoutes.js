const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productController');
const { requireAuth, requireRole } = require('../middleware/auth');
const upload = require('../utils/upload');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.post('/', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.create);
router.put('/:id', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.update);
router.delete('/:id', requireAuth, requireRole('owner', 'admin'), ctrl.remove);
router.patch('/:id/stock', requireAuth, requireRole('owner', 'admin', 'manager'), ctrl.adjustStock);
router.post('/upload-image', requireAuth, requireRole('owner', 'admin', 'manager'), upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
