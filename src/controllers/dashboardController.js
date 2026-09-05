const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const DeliveryBoy = require('../models/DeliveryBoy');
const emit = require('../sockets/emit');
const { online } = require('../sockets/io');

async function buildOverview() {
  const [orderCount, revenueAgg, lowStock, pendingDrivers, activeUsers, statusCounts] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Product.countDocuments({ stock: { $lte: 5 } }),
    DeliveryBoy.countDocuments({ status: 'pending' }),
    User.countDocuments({ status: 'active' }),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  ]);

  return {
    orderCount,
    revenue: revenueAgg[0]?.total || 0,
    lowStock,
    pendingDrivers,
    activeUsers,
    statusCounts: statusCounts.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {}),
    liveCounts: {
      customersOnline: online.customers.size,
      driversOnline: online.drivers.size,
      adminsOnline: online.admins.size
    }
  };
}

// GET /api/dashboard  (admin overview cards - also used for the initial load;
// live deltas after that arrive over the 'dashboard:stats' socket event)
exports.overview = async (req, res) => {
  res.json(await buildOverview());
};

// Called by orderController after anything that changes the numbers, so every
// connected admin screen updates without polling or a manual refresh.
exports.pushDashboardStats = async () => {
  emit.dashboardStats(await buildOverview());
};
