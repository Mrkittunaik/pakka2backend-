const express = require('express');
require('express-async-errors'); // makes every `async (req,res)=>{...}` controller's thrown/rejected errors reach the error handler below, instead of hanging the request (Express 4 doesn't do this natively)
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet({
  // Default helmet sets Cross-Origin-Resource-Policy: same-origin, which
  // blocks browsers from using responses fetched from a different origin
  // (admin/webapp/delivery apps are all on separate pages.dev domains from
  // this API) even when CORS headers are correct. Relax it so the
  // whitelisted frontends above can actually consume the responses.
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// CORS must run BEFORE the rate limiter (and before any route). If the
// limiter runs first, a throttled/blocked OPTIONS preflight never gets
// CORS headers attached, so the browser reports it as a CORS failure
// even though the real cause is unrelated - this was hiding the actual
// error behind a misleading "CORS policy" message for every endpoint.
const allowedOrigins = [
  'https://milkadmin.pages.dev',
  'https://milkwebapp.pages.dev',
  'https://deliverymilk.pages.dev'
];

app.use(cors({
  origin(origin, callback) {
    // allow non-browser tools (no Origin header) and any whitelisted frontend
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  // 300 was too low for real usage: the admin dashboard alone fires ~13
  // requests per page load, and polls every 20s when the live socket isn't
  // connected — that's ~40 requests/min from a single idle tab, enough to
  // trip a 300/15min cap in under 10 minutes even with no abuse happening.
  // 2000 gives real traffic (admin + customer webapp + delivery app, several
  // devices at once) comfortable headroom while still catching genuine abuse.
  // Override with RATE_LIMIT_MAX env var if you need to tune it further.
  max: Number(process.env.RATE_LIMIT_MAX) || 2000,
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', apiLimiter);

// Razorpay webhook MUST be mounted before express.json() below and parsed
// with express.raw() - its HMAC signature is computed over the exact raw
// request bytes Razorpay sent, and re-serializing through JSON.parse/
// JSON.stringify would produce different bytes and always fail the check.
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), require('./controllers/gatewayController').webhook);

app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', require('./routes/productRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/delivery-boys', require('./routes/deliveryBoyRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/plans', require('./routes/planRoutes'));
app.use('/api/subscriptions', require('./routes/subscriptionRoutes'));
app.use('/api/bottle-tickets', require('./routes/bottleTicketRoutes'));
app.use('/api/coupons', require('./routes/couponRoutes'));
app.use('/api/banners', require('./routes/bannerRoutes'));
app.use('/api/categories', require('./routes/categoryRoutes'));
app.use('/api/zones', require('./routes/zoneRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/staff', require('./routes/staffRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// centralized error handler
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  if (err.name === 'CastError') return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
  if (err.code === 11000) return res.status(409).json({ error: 'Duplicate value', field: Object.keys(err.keyPattern || {})[0] });
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

module.exports = app;
