// Converts each active Subscription due for TODAY + the given slot into a
// real Order document, so it flows through the exact same accept/reject
// pipeline as a one-off cart order. Designed to be safe to run more than
// once for the same day (e.g. after a server restart) - it checks for an
// existing order first instead of creating duplicates.

const Subscription = require('../models/Subscription');
const Order = require('../models/Order');
const User = require('../models/User');
const emit = require('../sockets/emit');
const { dateKey } = require('./subscriptionRules');

const QTY_LITERS = { half: 0.5, one: 1, two: 2 };
const DURATION_DAYS = { weekly: 7, monthly: 30, sixmonth: 180 };
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

async function nextOrderCode() {
  const last = await Order.findOne().sort({ createdAt: -1 });
  const lastNum = last ? parseInt(String(last.orderCode).replace(/\D/g, ''), 10) : 1040;
  return `PD${(lastNum || 1040) + 1}`;
}

// Works out what today's delivery is worth and how much milk, for either a
// fixed Plan or a custom per-weekday schedule. Returns null if nothing is
// due today (e.g. a custom schedule with "none" for today's weekday).
function resolveTodaysLine(sub, today) {
  if (sub.plan) {
    const days = DURATION_DAYS[sub.plan.duration] || 30;
    const perDeliveryPrice = Math.round(sub.plan.price / days);
    const liters = QTY_LITERS[sub.plan.qty] || 1;
    return { price: perDeliveryPrice, liters, label: `${sub.plan.name} (${sub.plan.qty} milk)` };
  }
  if (sub.custom) {
    const weekdayKey = WEEKDAY_KEYS[today.getDay()];
    const qty = sub.custom[weekdayKey];
    if (!qty || qty === 'none') return null;
    const liters = QTY_LITERS[qty] || 0;
    // Custom schedules have no fixed plan price - fall back to a flat
    // per-liter estimate; admin can adjust the order's total manually if needed.
    const FLAT_PRICE_PER_LITER = Number(process.env.CUSTOM_SUB_PRICE_PER_LITER ?? 60);
    return { price: Math.round(liters * FLAT_PRICE_PER_LITER), liters, label: `Custom milk (${qty})` };
  }
  return null;
}

// Generates today's orders for the given slot ('morning' | 'evening').
// Call this from the cron scheduler (see cron.js) or manually via an
// admin-triggered endpoint for backfilling a missed run.
async function generateDeliveriesForSlot(slot, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);

  const subs = await Subscription.find({ active: true, slot, startDate: { $lte: now } }).populate('plan');

  const results = { created: 0, skipped: 0, alreadyExisted: 0, errors: [] };

  for (const sub of subs) {
    try {
      if (sub.skippedDates.includes(todayKey)) { results.skipped++; continue; }

      const line = resolveTodaysLine(sub, today);
      if (!line) { results.skipped++; continue; }

      // Idempotency guard: don't double-create if this cron already ran today
      // for this subscription (e.g. server restarted right after a run).
      const existing = await Order.findOne({
        subscription: sub._id,
        isSubscriptionDelivery: true,
        createdAt: { $gte: today }
      });
      if (existing) { results.alreadyExisted++; continue; }

      const user = await User.findById(sub.customer);
      if (!user) { results.errors.push(`Subscription ${sub._id}: customer not found`); continue; }

      const addrMatch = user.addresses?.find(a => a.address === sub.address) || user.addresses?.find(a => a.isDefault);

      const order = await Order.create({
        orderCode: await nextOrderCode(),
        customer: user._id,
        customerName: user.name || user.phone,
        phone: user.phone,
        address: sub.address,
        lat: addrMatch ? addrMatch.lat : undefined,
        lng: addrMatch ? addrMatch.lng : undefined,
        items: [{ name: line.label, qty: line.liters, price: line.price }],
        total: line.price,
        status: 'placed',
        paymentStatus: sub.paymentStatus === 'paid' ? 'paid' : 'cod',
        isSubscriptionDelivery: true,
        subscription: sub._id,
        slot
      });

      emit.orderCreated(order);
      const { broadcastToNearbyDrivers } = require('../controllers/orderController');
      await broadcastToNearbyDrivers(order);
      results.created++;
    } catch (err) {
      results.errors.push(`Subscription ${sub._id}: ${err.message}`);
    }
  }

  return results;
}

module.exports = { generateDeliveriesForSlot };
