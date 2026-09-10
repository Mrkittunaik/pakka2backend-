const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

// Customer (user webapp)
router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/google', ctrl.googleAuth);
// requireAuth: bind-phone now identifies the user from the JWT that
// googleAuth already issued, instead of trusting a client-sent googleId.
router.post('/bind-phone', requireAuth, ctrl.bindPhone);

// Admin (miLKadmin)
router.post('/admin/login', ctrl.staffLogin);

// Delivery (deliverymilk)
router.post('/delivery/login', ctrl.deliveryLogin);
router.post('/delivery/register', ctrl.deliveryRegister);

module.exports = router;
