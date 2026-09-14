const crypto = require('crypto');
const emit = require('../sockets/emit');
const Payment = require('../models/Payment');
const { priceCart } = require('./orderController');

// Lazily construct the Razorpay client only when real keys are present, so
// dev-mode (no keys in .env) never even tries to load/init the SDK with
// undefined credentials.
function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  const Razorpay = require('razorpay');
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

// POST /api/payments/create-order  { items: [{productId, qty}], couponCode }
//
// IMPORTANT: this does NOT trust a client-supplied amount. The cart is
// re-priced here using the exact same priceCart() logic orderController
// uses when the order is actually placed, so what the customer is charged
// can never drift from what they're ordering (stale prices, tampered
// totals, race conditions with a price change - none of that can leak
// through). The frontend only ever sends product ids + quantities.
exports.createOrder = async (req, res) => {
  const { items, couponCode } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'items are required' });

  let total;
  try {
    ({ total } = await priceCart(items, couponCode));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (total <= 0) return res.status(400).json({ error: 'Order total must be greater than zero' });

  const amountPaise = Math.round(total * 100);
  const rzp = getRazorpayClient();

  if (!rzp) {
    // Dev mode: no real keys configured yet. Returns a fake order id so the
    // frontend flow (create-order -> checkout -> verify -> place order) can
    // be built and tested end-to-end before real Razorpay keys exist.
    const orderId = 'order_dev_' + crypto.randomBytes(8).toString('hex');
    return res.json({ orderId, amount: amountPaise, currency: 'INR', keyId: null, dev: true });
  }

  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: 'INR',
    // Razorpay receipts must be <= 40 chars.
    receipt: `rcpt_${req.auth.id}_${Date.now()}`.slice(0, 40)
  });

  res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID, dev: false });
};

// POST /api/payments/verify  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
//
// Verifies the HMAC signature Razorpay's checkout returns, proving the
// payment actually came from Razorpay and wasn't forged by the client.
// Records a Payment ledger entry so it shows up in the admin Payment
// Manager immediately, live over sockets - the frontend then calls
// POST /api/orders with paymentStatus:'paid' + paymentOrderId to actually
// place the order (see orderController.create).
exports.verify = async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ ok: false, error: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are all required' });
  }

  if (!process.env.RAZORPAY_KEY_SECRET) {
    // Dev mode: no real keys configured, accept anything so the flow can be
    // exercised end-to-end without live Razorpay credentials.
    return res.json({ ok: true, dev: true });
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expected !== razorpay_signature) {
    return res.status(400).json({ ok: false, error: 'Signature mismatch - payment could not be verified' });
  }

  // Record the ledger entry now (order:null until orderController.create
  // links it moments later) so admin sees the payment land in real time
  // even if the customer's browser is slow/closes before placing the order.
  const payment = await Payment.create({
    customer: req.auth.id,
    amount: 0, // filled in / superseded once the Order (with its real total) exists; see note below
    status: 'paid',
    method: 'razorpay',
    ref: razorpay_payment_id
  });
  emit.paymentChanged(payment); // -> admin Payment Manager + customer both update live

  res.json({ ok: true, paymentOrderId: razorpay_order_id, paymentRef: razorpay_payment_id });
};

// POST /api/payments/webhook  (Razorpay server -> server webhook, raw body)
//
// Safety net independent of the customer's browser: if the app crashes,
// loses network, or the user closes the tab right after paying but before
// /verify or /api/orders ever fire, Razorpay still calls this directly so
// the payment isn't silently lost from the admin's view. Must be mounted
// with express.raw() (see routes/paymentRoutes.js) - the signature check
// needs the exact raw bytes Razorpay signed, not a re-serialized JSON body.
exports.webhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return res.status(200).json({ ok: true, skipped: 'webhook secret not configured' });

  const signature = req.headers['x-razorpay-signature'];
  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  if (signature !== expected) return res.status(400).json({ ok: false, error: 'Invalid webhook signature' });

  const event = JSON.parse(req.body.toString('utf8'));
  if (event.event === 'payment.captured') {
    const p = event.payload.payment.entity;
    const existing = await Payment.findOne({ ref: p.id });
    if (!existing) {
      const payment = await Payment.create({
        customer: null, // webhook has no session/JWT to attribute a customer - reconciled by ref if/when the order lands
        amount: p.amount / 100,
        status: 'paid',
        method: 'razorpay',
        ref: p.id
      });
      emit.paymentChanged(payment);
    }
  }

  res.status(200).json({ ok: true });
};
