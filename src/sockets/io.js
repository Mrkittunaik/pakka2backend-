const { Server } = require('socket.io');
const { verifyToken } = require('../utils/token');

const allowedOrigins = [
  'https://milkadmin.pages.dev',
  'https://milkwebapp.pages.dev',
  'https://deliverymilk.pages.dev'
];

let io = null;

// in-memory presence counters (per-process; fine for a single-instance deploy)
const online = { customers: new Set(), drivers: new Set(), admins: new Set() };

function roleBucket(role) {
  if (role === 'customer') return 'customers';
  if (role === 'delivery') return 'drivers';
  return 'admins'; // owner/admin/manager/support
}

function broadcastLiveCounts() {
  if (!io) return;
  io.to('admins').emit('liveCounts', {
    customersOnline: online.customers.size,
    driversOnline: online.drivers.size,
    adminsOnline: online.admins.size
  });
}

function init(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: allowedOrigins, credentials: true }
  });

  // Auth handshake: client connects with `io(url, { auth: { token } })`.
  // A token is required to join role-specific rooms (orders, driver jobs,
  // admin dashboard), but guests browsing the storefront are still allowed
  // to connect with no token at all - they only get the public 'catalog'
  // room below, so product/price/banner updates reach everyone live,
  // logged in or not.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      socket.auth = null; // guest
      return next();
    }
    try {
      socket.auth = verifyToken(token);
      next();
    } catch (err) {
      next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('catalog'); // everyone, including guests: product/coupon/banner/plan/category/zone updates

    if (!socket.auth) return; // guest: no further rooms, no presence tracking

    const { id, role } = socket.auth;
    const bucket = roleBucket(role);

    online[bucket].add(socket.id);

    if (role === 'customer') {
      socket.join(`user:${id}`);
    } else if (role === 'delivery') {
      socket.join(`driver:${id}`);
      socket.join('drivers'); // admin-visible aggregate room
    } else {
      socket.join('admins'); // owner/admin/manager/support
    }

    broadcastLiveCounts();

    // Delivery app pushes its GPS position directly over the socket for lowest
    // latency; REST PATCH /delivery-boys/me/location still works as a fallback.
    socket.on('driver:location', (payload) => {
      if (role !== 'delivery') return;
      const { lat, lng, orderId } = payload || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;

      io.to('admins').emit('driver:location', { driverId: id, lat, lng, at: Date.now() });
      if (orderId) io.to(`order:${orderId}`).emit('driver:location', { driverId: id, lat, lng, at: Date.now() });
    });

    // Customer opens live-tracking screen for a specific order
    socket.on('order:track', (orderId) => {
      if (role === 'customer' && orderId) socket.join(`order:${orderId}`);
    });
    socket.on('order:untrack', (orderId) => {
      if (orderId) socket.leave(`order:${orderId}`);
    });

    socket.on('disconnect', () => {
      online[bucket].delete(socket.id);
      broadcastLiveCounts();
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error('Socket.IO not initialized yet');
  return io;
}

module.exports = { init, getIO, broadcastLiveCounts, online };
