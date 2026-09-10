const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Staff = require('../models/Staff');
const DeliveryBoy = require('../models/DeliveryBoy');
const Otp = require('../models/Otp');
const { generateCode, sendSms } = require('../utils/otp');
const { signToken } = require('../utils/token');

// GOOGLE_CLIENT_ID must match window.PD_GOOGLE_CLIENT_ID on the frontend -
// it's the same OAuth Client ID, just used here to check the token's
// "audience" so we only accept tokens issued for OUR app.
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* ---------------- Customer app: phone + OTP ---------------- */

// POST /api/auth/send-otp { phone }
exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'phone must be exactly 10 digits' });

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
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: 'Server misconfigured: GOOGLE_CLIENT_ID is not set' });
  }

  // Real server-side verification: this checks the token's signature against
  // Google's public keys, its expiry, and that it was issued for OUR
  // GOOGLE_CLIENT_ID (the "audience"). If any of that fails, verifyIdToken
  // throws, and the client-sent value is never trusted directly.
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    payload = ticket.getPayload();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid Google credential' });
  }

  const googleId = payload.sub;   // stable unique Google user id
  const email = payload.email;
  const name = payload.name;

  let user = await User.findOne({ googleId });
  if (!user) {
    // A user may already exist with this email from a previous phone-only
    // signup - link the accounts instead of creating a duplicate.
    user = await User.findOne({ email });
    if (user) {
      user.googleId = googleId;
      if (!user.name) user.name = name;
      await user.save();
    } else {
      user = await User.create({ googleId, email, name, phone: null, status: 'new' });
    }
  }

  const token = signToken({ id: user._id, role: 'customer' });
  res.json({ ok: true, token, user, needsPhone: !user.phone });
};

// POST /api/auth/bind-phone { phone } - attach phone to the CURRENTLY LOGGED IN
// user, identified by their JWT (from requireAuth), not by a client-sent id.
// The googleAuth call already returns a token even when needsPhone is true,
// so the frontend has a valid Authorization header to send here.
exports.bindPhone = async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required' });
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'phone must be exactly 10 digits' });

  const takenByOther = await User.findOne({ phone, _id: { $ne: req.auth.id } });
  if (takenByOther) return res.status(409).json({ error: 'This phone number is already linked to another account' });

  const user = await User.findByIdAndUpdate(req.auth.id, { phone }, { new: true });
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
  if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'phone must be exactly 10 digits' });
  if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

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
