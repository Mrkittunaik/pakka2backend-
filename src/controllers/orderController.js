const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const emit = require('../sockets/emit');
const { pushDashboardStats } = require('./dashboardController');

async function nextOrderCode() {
  const last = await Order.findOne().sort({ createdAt: -1 });
  const lastNum = last ? parseInt(String(last.orderCode).replace(/\D/g, ''), 10) : 1040;
  return `PD${(lastNum || 1040) + 1}`;
}

// Wraps order creation with a retry: if two checkouts race and land on the same
// orderCode, the unique index rejects the second insert (code 11000) and we
// simply regenerate and try again, instead of failing the customer's order.
async function createOrderWithRetry(data, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      data.orderCode = await nextOrderCode();
      return await Order.create(data);
    } catch (err) {
      if (err.code === 11000 && i < attempts - 1) continue;
      throw err;
    }
  }
}

// Server-trusted pricing: re-reads each product's live price/stock from the
// DB and applies any coupon, never trusting client-supplied prices. Shared
// by exports.create (COD/already-paid orders) AND gatewayController
// .createOrder (the Razorpay pre-payment step) so the amount a customer is
// actually CHARGED can never drift from the amount their order is placed
// for - both paths compute the total exactly the same way.
async function priceCart(items, couponCode) {
  if (!items || !items.length) {
    const err = new Error('items are required');
    err.status = 400;
    throw err;
  }

  let total = 0;
  const resolvedItems = [];
  for (const it of items) {
    const product = await Product.findById(it.productId);
    if (!product || !product.available) {
      const err = new Error(`Product unavailable: ${it.productId}`);
      err.status = 400;
      throw err;
    }
    if (product.stock < it.qty) {
      const err = new Error(`Insufficient stock for ${product.name}`);
      err.status = 400;
      throw err;
    }
    total += product.price * it.qty;
    resolvedItems.push({ product: product._id, name: `${product.name} ${product.unit}`, qty: it.qty, price: product.price });
  }

  let discount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), active: true });
    if (coupon && coupon.expiry > new Date() && total >= coupon.minOrder) {
      discount = coupon.type === 'flat' ? coupon.value : Math.round((coupon.value / 100) * total);
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
      appliedCoupon = coupon;
    }
  }
  total = Math.max(0, total - discount);

  return { resolvedItems, total, discount, appliedCoupon };
}

// How long an order stays offered before we stop waiting for a manual
// accept and auto-assign it ourselves. Kept short since these are
// short-hop local deliveries - a rider who's actually free will see and
// tap the offer well within this window.
const AUTO_ASSIGN_TIMEOUT_MS = 4000;

// Assigns `order` to whichever of `offeredTo` currently has the fewest
// active orders (status 'out') - the least-busy rider. Ties broken by
// whoever comes first in the offeredTo list (already nearest-first from
// findNearbyDeliveryBoys). Uses the same atomic compare-and-swap as a
// manual accept, so if a rider's own tap wins the race in the meantime,
// this becomes a no-op instead of double-assigning.
async function autoAssignToLeastBusyDriver(orderId) {
  const fresh = await Order.findById(orderId);
  if (!fresh || fresh.status !== 'pending_acceptance') return; // already accepted/rejected/cancelled - nothing to do

  const candidateIds = fresh.offeredTo.map(String).filter(id => !fresh.rejectedBy.some(r => String(r) === id));
  if (!candidateIds.length) return; // everyone already rejected - broadcastToNearbyDrivers' own reject-path handles that case

  const counts = await Order.aggregate([
    { $match: { status: 'out', assigned: { $ne: null } } },
    { $group: { _id: '$assigned', active: { $sum: 1 } } }
  ]);
  const activeCountById = new Map(counts.map(c => [String(c._id), c.active]));

  let chosenId = candidateIds[0];
  let lowest = activeCountById.get(chosenId) || 0;
  for (const id of candidateIds.slice(1)) {
    const n = activeCountById.get(id) || 0;
    if (n < lowest) { lowest = n; chosenId = id; }
  }

  const won = await Order.findOneAndUpdate(
    { _id: orderId, status: 'pending_acceptance' },
    { status: 'out', assigned: chosenId, acceptedAt: new Date() },
    { new: true }
  ).populate('assigned', 'name phone');
  if (!won) return; // a real accept/reject landed first - no-op

  const others = won.offeredTo.map(String).filter(id => id !== chosenId);
  emit.orderTakenByOther(won, others);
  emit.orderAssigned(won);
  emit.orderStatusChanged(won);
  pushDashboardStats();
}

// Shared by exports.create (auto-broadcast) and exports.offer (manual re-broadcast
// from the admin dashboard, e.g. after everyone rejected the first round).
async function broadcastToNearbyDrivers(order) {
  const DeliveryBoy = require('../models/DeliveryBoy');
  const { findNearbyDeliveryBoys } = require('../utils/geo');
  const nearby = await findNearbyDeliveryBoys(DeliveryBoy, order.lat, order.lng, 8);

  if (!nearby.length) {
    emit.orderNeedsManualAssign(order);
    return order;
  }

  order.status = 'pending_acceptance';
  order.offeredTo = nearby.map(d => d._id);
  order.offeredAt = new Date();
  order.rejectedBy = [];
  await order.save();
  emit.orderOffered(order, order.offeredTo.map(String));

  setTimeout(() => {
    autoAssignToLeastBusyDriver(order._id).catch(err => {
      console.error('[autoAssign] failed for order', order._id, err);
    });
  }, AUTO_ASSIGN_TIMEOUT_MS);

  return order;
}

// POST /api/orders  (customer app - matches "Full order payload ready for POST /api/orders")
exports.create = async (req, res) => {
  const userId = req.auth.id;
  const { items, address, couponCode, paymentStatus, paymentRef, paymentOrderId, locationAccuracy } = req.body;
  let { lat, lng } = req.body;
  if (!items || !items.length) return res.status(400).json({ error: 'items are required' });

  const user = await User.findById(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status === 'blocked') return res.status(403).json({ error: 'Account is blocked' });

  // If checkout didn't pass coordinates directly, fall back to the matching
  // saved address (or the default one) so the admin map always has a pin.
  if ((lat === undefined || lng === undefined) && user.addresses?.length) {
    const match = user.addresses.find(a => a.address === address) || user.addresses.find(a => a.isDefault) || user.addresses[0];
    if (match) { lat = match.lat; lng = match.lng; }
  }

  // For a Razorpay-paid order, the frontend has already gone through
  // gatewayController.createOrder -> gatewayController.verify before
  // calling this endpoint, so the payment signature is already verified.
  // We still re-price the cart from scratch here (never trust client
  // prices/total for what gets recorded), but skip re-verifying payment -
  // that already happened. paymentOrderId links this Order back to the
  // Razorpay order for the admin Payment Manager / refunds.
  let resolvedItems, total, discount, appliedCoupon;
  try {
    ({ resolvedItems, total, discount, appliedCoupon } = await priceCart(items, couponCode));
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  if (appliedCoupon) {
    appliedCoupon.usedCount += 1;
    await appliedCoupon.save();
  }

  const order = await createOrderWithRetry({
    customer: user._id,
    customerName: user.name || user.phone,
    phone: user.phone,
    address,
    lat, lng,
    locationAccuracy: typeof locationAccuracy === 'number' ? locationAccuracy : undefined,
    items: resolvedItems,
    total,
    status: 'placed',
    couponCode: couponCode || null,
    discount,
    paymentStatus: paymentStatus || 'cod',
    paymentOrderId: paymentOrderId || null,
    paymentRef: paymentRef || null
  });

  for (const it of resolvedItems) {
    await Product.findByIdAndUpdate(it.product, { $inc: { stock: -it.qty, sold: it.qty } });
  }
  await User.findByIdAndUpdate(user._id, { $inc: { ordersCount: 1 }, status: 'active' });

  // If this order was paid via Razorpay, gatewayController.verify already
  // created a Payment ledger row (amount unknown at that point - the cart
  // hadn't been priced into a real Order yet). Link it to this order now
  // and fill in the real amount, rather than leaving a 0-amount ledger row.
  if (paymentRef && paymentStatus === 'paid') {
    const Payment = require('../models/Payment');
    const linked = await Payment.findOneAndUpdate(
      { ref: paymentRef },
      { order: order._id, customer: user._id, amount: total },
      { new: true }
    );
    if (linked) emit.paymentChanged(linked);
  }

  emit.orderCreated(order); // -> admin dashboard/order list updates live, no refresh needed

  // Auto-broadcast to nearby delivery boys immediately - no admin click needed.
  // If nobody's nearby, broadcastToNearbyDrivers() falls back to notifying
  // admin that this one needs a manual assign instead of silently stalling.
  await broadcastToNearbyDrivers(order);

  pushDashboardStats();
  res.status(201).json(order);
};

// GET /api/orders (admin: all, filterable; customer: their own; delivery: assigned)
exports.list = async (req, res) => {
  const { status } = req.query;
  const filter = {};
  if (status) filter.status = status;

  if (req.auth.role === 'customer') filter.customer = req.auth.id;
  if (req.auth.role === 'delivery') filter.assigned = req.auth.id;

  const orders = await Order.find(filter).sort({ createdAt: -1 }).populate('assigned', 'name phone');
  res.json(orders);
};

exports.getOne = async (req, res) => {
  const order = await Order.findById(req.params.id).populate('assigned', 'name phone');
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
};

// PATCH /api/orders/:id/status  (admin or delivery boy moving it through the pipeline)
exports.updateStatus = async (req, res) => {
  const { status } = req.body;
  const allowed = ['placed', 'preparing', 'pending_acceptance', 'out', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (req.auth.role === 'delivery' && String(order.assigned) !== String(req.auth.id)) {
    return res.status(403).json({ error: 'Not assigned to you' });
  }

  order.status = status;
  await order.save();

  if (status === 'delivered' && order.assigned) {
    const DeliveryBoy = require('../models/DeliveryBoy');
    await DeliveryBoy.findByIdAndUpdate(order.assigned, { $inc: { deliveries: 1 } });
  }

  // Populate before emitting - the live socket payload must carry the same
  // shape as GET /api/orders (assigned = {name, phone}), not a bare
  // ObjectId, or the customer's live order card renders a blank rider.
  await order.populate('assigned', 'name phone');

  emit.orderStatusChanged(order); // -> customer's order tracker, driver's job list, admin board all update live
  pushDashboardStats();
  res.json(order);
};

// PATCH /api/orders/:id/assign  { deliveryBoyId }  (admin only - direct manual assign, no accept/reject)
exports.assign = async (req, res) => {
  const { deliveryBoyId } = req.body;
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { assigned: deliveryBoyId, status: 'out' },
    { new: true }
  ).populate('assigned', 'name phone'); // same shape as GET /api/orders for the live payload
  if (!order) return res.status(404).json({ error: 'Order not found' });
  emit.orderAssigned(order); // -> pushes the job straight into the delivery boy's live queue
  res.json(order);
};

// PATCH /api/orders/:id/offer  (admin - manual re-broadcast, e.g. after everyone
// rejected the first round, or to retry a manual-assign-needed order)
exports.offer = async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (!['placed', 'preparing'].includes(order.status)) {
    return res.status(400).json({ error: `Cannot offer an order in status "${order.status}"` });
  }

  await broadcastToNearbyDrivers(order);
  res.json(order);
};

// PATCH /api/orders/:id/respond  { action: 'accept' | 'reject' }  (delivery boy)
// Race-safe: uses an atomic findOneAndUpdate guarded on status=pending_acceptance
// so if two drivers tap Accept at the same instant, only the first write wins -
// the second gets back null and a clean "already taken" response, never a
// double-assigned order.
exports.respond = async (req, res) => {
  const { action } = req.body;
  const driverId = req.auth.id;
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'action must be "accept" or "reject"' });
  }

  const existing = await Order.findById(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Order not found' });
  if (existing.status !== 'pending_acceptance') {
    return res.status(409).json({ error: 'This order is no longer available', status: existing.status });
  }
  if (!existing.offeredTo.some(id => String(id) === String(driverId))) {
    return res.status(403).json({ error: 'This order was not offered to you' });
  }

  if (action === 'reject') {
    existing.rejectedBy.push(driverId);
    await existing.save();
    emit.orderRejectedByDriver(existing, driverId);

    // If everyone offered has now rejected, try one more broadcast round
    // (radius/pool may have changed) before falling back to admin.
    const allRejected = existing.offeredTo.every(id =>
      existing.rejectedBy.some(r => String(r) === String(id))
    );
    if (allRejected) {
      existing.status = 'placed';
      await existing.save();
      await broadcastToNearbyDrivers(existing);
    }
    return res.json({ status: 'rejected', order: existing });
  }

  // action === 'accept' - atomic compare-and-swap on status so only one write lands
  const won = await Order.findOneAndUpdate(
    { _id: req.params.id, status: 'pending_acceptance' },
    { status: 'out', assigned: driverId, acceptedAt: new Date() },
    { new: true }
  ).populate('assigned', 'name phone'); // same shape as GET /api/orders for the live payload

  if (!won) {
    // Someone else's accept landed first between our read above and now.
    return res.status(409).json({ error: 'Order already accepted by another delivery partner' });
  }

  const others = won.offeredTo.map(String).filter(id => id !== String(driverId));
  emit.orderTakenByOther(won, others); // pull the offer card off everyone else's screen instantly
  emit.orderAssigned(won);             // -> customer sees rider assigned, admin board updates
  emit.orderStatusChanged(won);
  const { pushDashboardStats } = require('./dashboardController');
  pushDashboardStats();

  res.json({ status: 'accepted', order: won });
};

module.exports.broadcastToNearbyDrivers = broadcastToNearbyDrivers;
module.exports.priceCart = priceCart;
