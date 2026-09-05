const { getIO } = require('./io');

function safe(fn) {
  try { fn(); } catch (e) { /* io not initialized (e.g. in tests) - ignore */ }
}

// Catalog-level changes: every connected app (admin/user/delivery) refreshes.
exports.catalogChanged = (kind, doc) => safe(() => {
  getIO().to('catalog').emit('catalog:changed', { kind, doc }); // kind: product|coupon|banner|category|plan|zone
});

exports.orderCreated = (order) => safe(() => {
  getIO().to('admins').emit('order:new', order); // includes address, lat, lng, phone, items, total — ready to plot on the admin map immediately
});

exports.orderStatusChanged = (order) => safe(() => {
  getIO().to('admins').emit('order:status', order);
  getIO().to(`user:${order.customer}`).emit('order:status', order);
  getIO().to(`order:${order._id}`).emit('order:status', order);
  if (order.assigned) getIO().to(`driver:${order.assigned}`).emit('order:status', order);
});

exports.orderAssigned = (order) => safe(() => {
  getIO().to('admins').emit('order:assigned', order);
  getIO().to(`user:${order.customer}`).emit('order:assigned', order);
  if (order.assigned) getIO().to(`driver:${order.assigned}`).emit('order:assigned', order);
});

exports.driverStatusChanged = (driver) => safe(() => {
  getIO().to('admins').emit('driver:status', driver);
  getIO().to(`driver:${driver._id}`).emit('driver:status', driver); // e.g. account approved/suspended
});

exports.driverUpdated = (driver) => safe(() => {
  getIO().to('admins').emit('driver:updated', driver);
  getIO().to(`driver:${driver._id}`).emit('driver:updated', driver);
});

exports.userStatusChanged = (user) => safe(() => {
  getIO().to('admins').emit('user:status', user);
  getIO().to(`user:${user._id}`).emit('user:status', user); // e.g. blocked mid-session
});

exports.subscriptionChanged = (sub) => safe(() => {
  getIO().to('admins').emit('subscription:changed', sub);
  getIO().to(`user:${sub.customer}`).emit('subscription:changed', sub);
});

exports.paymentChanged = (payment) => safe(() => {
  getIO().to('admins').emit('payment:changed', payment);
  if (payment.customer) getIO().to(`user:${payment.customer}`).emit('payment:changed', payment);
});

exports.dashboardStats = (stats) => safe(() => {
  getIO().to('admins').emit('dashboard:stats', stats);
});
