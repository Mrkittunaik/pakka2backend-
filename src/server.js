require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const sockets = require('./sockets/io');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  const server = http.createServer(app);
  sockets.init(server);
  server.listen(PORT, () => console.log(`[server] milk-backend (HTTP + WebSocket) running on port ${PORT}`));
});
