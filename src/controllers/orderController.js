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

// POST /api/orders  (customer app - matches "Full order payload ready for POST /api/orders")
exports.create = async (req, res) => {
  const userId = req.auth.id;
  const { items, address, couponCode, paymentStatus, paymentRef } = req.body;
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

  // Price + stock check server-side (never trust client prices)
  let total = 0;
  const resolvedItems = [];
  for (const it of items) {
    const product = await Product.findById(it.productId);
    if (!product || !product.available) return res.status(400).json({ error: `Product unavailable: ${it.productId}` });
    if (product.stock < it.qty) return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
    total += product.price * it.qty;
    resolvedItems.push({ product: product._id, name: `${product.name} ${product.unit}`, qty: it.qty, price: product.price });
  }

  let discount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), active: true });
    if (coupon && coupon.expiry > new Date() && total >= coupon.minOrder) {
      discount = coupon.type === 'flat' ? coupon.value : Math.round((coupon.value / 100) * total);
      if (coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
      coupon.usedCount += 1;
      await coupon.save();
    }
  }
  total = Math.max(0, total - discount);

  const order = await createOrderWithRetry({
    customer: user._id,
    customerName: user.name || user.phone,
    phone: user.phone,
    address,
    lat, lng,
    items: resolvedItems,
    total,
    status: 'placed',
    couponCode: couponCode || null,
    discount,
    paymentStatus: paymentStatus || 'cod',
    paymentRef: paymentRef || null
  });

  for (const it of resolvedItems) {
    await Product.findByIdAndUpdate(it.product, { $inc: { stock: -it.qty, sold: it.qty } });
  }
  await User.findByIdAndUpdate(user._id, { $inc: { ordersCount: 1 }, status: 'active' });

  emit.orderCreated(order); // -> admin dashboard/order list updates live, no refresh needed
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
  const allowed = ['placed', 'preparing', 'out', 'delivered', 'cancelled'];
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

  emit.orderStatusChanged(order); // -> customer's order tracker, driver's job list, admin board all update live
  pushDashboardStats();
  res.json(order);
};

// PATCH /api/orders/:id/assign  { deliveryBoyId }  (admin only)
exports.assign = async (req, res) => {
  const { deliveryBoyId } = req.body;
  const order = await Order.findByIdAndUpdate(
    req.params.id,
    { assigned: deliveryBoyId, status: 'out' },
    { new: true }
  );
  if (!order) return res.status(404).json({ error: 'Order not found' });
  emit.orderAssigned(order); // -> pushes the job straight into the delivery boy's live queue
  res.json(order);
};
