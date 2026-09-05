const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Staff = require('../models/Staff');
const DeliveryBoy = require('../models/DeliveryBoy');
const Otp = require('../models/Otp');
const { generateCode, sendSms } = require('../utils/otp');
const { signToken } = require('../utils/token');

/* ---------------- Customer app: phone + OTP ---------------- */

// POST /api/auth/send-otp { phone }
exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  await Otp.create({ phone, code, expiresAt });
  await sendSms(phone, code);

  res.json({ ok: true, message: 'OTP sent', devHint: process.env.OTP_DEV_MODE === 'true' ? code : undefined });
};

// POST /api/auth/verify-otp { phone, code }
exports.verifyOtp = async (req, res) => {
  const { phone, code } = req.body;
  if (!phone || !code) return res.status(400).json({ error: 'phone and code are required' });

  const otp = await Otp.findOne({ phone, consumed: false }).sort({ createdAt: -1 });
  if (!otp) return res.status(400).json({ error: 'No OTP requested for this phone' });
  if (otp.expiresAt < new Date()) return res.status(400).json({ error: 'OTP expired' });
  if (otp.code !== code) return res.status(400).json({ error: 'Incorrect OTP' });

  otp.consumed = true;
  await otp.save();

  let user = await User.findOne({ phone });
  if (!user) user = await User.create({ phone, status: 'new' });

  const token = signToken({ id: user._id, role: 'customer' });
  res.json({ ok: true, token, user });
};

// POST /api/auth/google { credential } - verify Google ID token, then bind/create user
exports.googleAuth = async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'credential is required' });

  // TODO: verify `credential` against Google using google-auth-library and
  // GOOGLE_CLIENT_ID. For now we trust a decoded payload passed by the client
  // only in dev; wire up real verification before going to production.
  const { googleId, email, name } = req.body;
  if (!googleId) return res.status(400).json({ error: 'googleId is required (dev stub)' });

  let user = await User.findOne({ googleId });
  if (!user) {
    user = await User.create({ googleId, email, name, phone: null, status: 'new' });
  }
  const token = signToken({ id: user._id, role: 'customer' });
  res.json({ ok: true, token, user, needsPhone: !user.phone });
};

// POST /api/auth/bind-phone { googleId, email, phone } - attach phone to a Google-created account
exports.bindPhone = async (req, res) => {
  const { googleId, phone } = req.body;
  if (!googleId || !phone) return res.status(400).json({ error: 'googleId and phone are required' });

  const user = await User.findOneAndUpdate({ googleId }, { phone }, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true, user });
};

/* ---------------- Admin app: email + password ---------------- */

// POST /api/auth/admin/login { email, password }
exports.staffLogin = async (req, res) => {
  const { email, password } = req.body;
  const staff = await Staff.findOne({ email, active: true });
  if (!staff) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, staff.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken({ id: staff._id, role: staff.role });
  res.json({ ok: true, token, staff: { id: staff._id, name: staff.name, email: staff.email, role: staff.role } });
};

/* ---------------- Delivery app: phone + password ---------------- */

// POST /api/auth/delivery/login { phone, password }
exports.deliveryLogin = async (req, res) => {
  const { phone, password } = req.body;
  const driver = await DeliveryBoy.findOne({ phone });
  if (!driver || !driver.passwordHash) return res.status(401).json({ error: 'Invalid credentials' });
  if (driver.status !== 'approved') return res.status(403).json({ error: `Account is ${driver.status}` });

  const ok = await bcrypt.compare(password, driver.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = signToken({ id: driver._id, role: 'delivery' });
  res.json({ ok: true, token, driver });
};

// POST /api/auth/delivery/register { name, phone, password, area, vehicle }
// Creates a pending delivery-boy application; admin must approve before login works.
exports.deliveryRegister = async (req, res) => {
  const { name, phone, password, area, vehicle } = req.body;
  if (!name || !phone || !password) return res.status(400).json({ error: 'name, phone, password are required' });

  const existing = await DeliveryBoy.findOne({ phone });
  if (existing) return res.status(409).json({ error: 'Phone already registered' });

  const passwordHash = await bcrypt.hash(password, 10);
  const driver = await DeliveryBoy.create({ name, phone, passwordHash, area, vehicle, status: 'pending' });
  res.status(201).json({ ok: true, message: 'Application submitted, pending admin approval', driver });
};

/* ---------------- Customer status check ---------------- */

// GET /api/users/:id/status -> { blocked: true/false }
exports.userStatus = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ blocked: user.status === 'blocked' });
};
