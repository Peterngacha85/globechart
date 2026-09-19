const { Server } = require('socket.io');
const { config } = require('./env');
const { resolveUser } = require('../middleware/auth.middleware');

// Sockets must present a valid access token; the room is derived from it, never from client input.
function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigins, methods: ['GET', 'POST'], credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const user = await resolveUser(token ? `Bearer ${token}` : null);
      if (!user || user.status === 'suspended' || user.status === 'banned') return next(new Error('Unauthorized'));
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      next();
    } catch (err) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.userId}`);
    if (socket.data.role === 'super_admin') socket.join('admins');
  });

  return io;
}

module.exports = { createSocketServer };
