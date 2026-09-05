const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/authController');

// Customer (user webapp)
router.post('/send-otp', ctrl.sendOtp);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/google', ctrl.googleAuth);
router.post('/bind-phone', ctrl.bindPhone);

// Admin (miLKadmin)
router.post('/admin/login', ctrl.staffLogin);

// Delivery (deliverymilk)
router.post('/delivery/login', ctrl.deliveryLogin);
router.post('/delivery/register', ctrl.deliveryRegister);

module.exports = router;
