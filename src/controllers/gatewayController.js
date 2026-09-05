const crypto = require('crypto');
const emit = require('../sockets/emit');

// POST /api/payments/create-order { amount, currency }
// Real integration: use the Razorpay Node SDK with RAZORPAY_KEY_ID / SECRET.
// This stub returns a fake orderId so the frontend flow can be wired end-to-end
// before real gateway keys are available.
exports.createOrder = async (req, res) => {
  const { amount, currency } = req.body;
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  if (!process.env.RAZORPAY_KEY_ID) {
    const orderId = 'order_dev_' + crypto.randomBytes(8).toString('hex');
    return res.json({ orderId, amount, currency: currency || 'INR', keyId: null, dev: true });
  }

  // const Razorpay = require('razorpay');
  // const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
  // const order = await rzp.orders.create({ amount: amount * 100, currency: currency || 'INR' });
  // return res.json({ orderId: order.id, amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });

  res.status(501).json({ error: 'Razorpay live mode not wired up yet - see comments in gatewayController.js' });
};

// POST /api/payments/verify { orderId, paymentId, signature }
exports.verify = async (req, res) => {
  const { orderId, paymentId, signature } = req.body;
  if (!process.env.RAZORPAY_KEY_ID) {
    // dev mode: accept anything
    return res.json({ ok: true, dev: true });
  }
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  if (expected !== signature) return res.status(400).json({ ok: false, error: 'Signature mismatch' });
  emit.paymentChanged({ customer: req.auth.id, orderId, paymentId, status: 'paid' }); // live "payment verified" push
  res.json({ ok: true });
};
