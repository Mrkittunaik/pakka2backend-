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

// Order broadcast to nearby delivery boys - "new job available, accept or reject"
exports.orderOffered = (order, driverIds) => safe(() => {
  const io = getIO();
  driverIds.forEach(id => io.to(`driver:${id}`).emit('order:offered', order));
  io.to('admins').emit('order:offered', order);
});

// Tells every OTHER driver it was offered to that someone already accepted,
// so their UI can pull the card instantly instead of them tapping into a 409.
exports.orderTakenByOther = (order, remainingDriverIds) => safe(() => {
  const io = getIO();
  remainingDriverIds.forEach(id => io.to(`driver:${id}`).emit('order:takenByOther', { _id: order._id }));
});

exports.orderRejectedByDriver = (order, driverId) => safe(() => {
  getIO().to('admins').emit('order:rejectedByDriver', { orderId: order._id, driverId });
});

// All eligible drivers rejected (or none were nearby) - admin needs to manually assign
exports.orderNeedsManualAssign = (order) => safe(() => {
  getIO().to('admins').emit('order:needsManualAssign', order);
});

// Driver GPS ping via REST fallback (see deliveryBoyController.updateMyLocation).
// Mirrors the socket 'driver:location' handler in sockets/io.js exactly, so the
// customer's track screen gets the same live pings either way.
exports.driverLocation = ({ driverId, lat, lng, orderId }) => safe(() => {
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  const io = getIO();
  const payload = { driverId, lat, lng, at: Date.now() };
  io.to('admins').emit('driver:location', payload);
  if (orderId) io.to(`order:${orderId}`).emit('driver:location', payload);
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

exports.userUpdated = (user) => safe(() => {
  getIO().to('admins').emit('user:updated', user);
  getIO().to(`user:${user._id}`).emit('user:updated', user); // profile/verify/avatar changed
});

exports.userDeleted = (userId) => safe(() => {
  getIO().to('admins').emit('user:deleted', { _id: userId });
});

exports.driverDeleted = (driverId) => safe(() => {
  getIO().to('admins').emit('driver:deleted', { _id: driverId });
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
