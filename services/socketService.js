const { Server } = require('socket.io');
const { register: registerScheduleSocketHandlers } = require('./socketScheduleHandlers');
const { bindSocketUser, roomForUserId, roomForEmail } = require('./socketAuth');
const { emitPollStatusToSocket } = require('./landSchedulePollManager');

let io = null;

/** Attach Socket.IO once to the shared HTTP server. */
function attachToHttpServer(httpServer) {
  if (io) {
    return io;
  }
  io = new Server(httpServer, {
    cors: { origin: true, methods: ['GET', 'POST'] }
  });

  io.use(async (socket, next) => {
    const auth = socket.handshake.auth || {};
    const bound = await bindSocketUser(socket, {
      token: auth.token,
      userId: auth.userId,
      email: auth.email
    });
    if (bound) {
      socket.data.authenticated = true;
    }
    next();
  });

  io.on('connection', (socket) => {
    const logPayload = {
      id: socket.id,
      transport: socket.conn.transport.name
    };
    if (socket.data.userId) {
      logPayload.userId = socket.data.userId;
      logPayload.email = socket.data.email;
    }
    console.log('[socket] connection opened, client connected', logPayload);

    socket.on('socket:identify', async (payload, ack) => {
      const bound = await bindSocketUser(socket, {
        token: payload && payload.token,
        userId: payload && payload.userId,
        email: payload && payload.email
      });
      const reply = bound
        ? { success: true, userId: bound.userId, email: bound.email, role: bound.role }
        : { success: false, message: 'Invalid or missing token (use app JWT via auth.token or socket:identify)' };
      if (typeof ack === 'function') {
        ack(reply);
      } else if (bound) {
        socket.emit('socket:identified', reply);
      } else {
        socket.emit('socket:identify:error', reply);
      }
      if (bound) {
        console.log('[socket] identified', { id: socket.id, userId: bound.userId, email: bound.email });
        emitPollStatusToSocket(socket);
      }
    });

    registerScheduleSocketHandlers(socket);

    // JWT in handshake.auth.token → user bound in middleware → send poll status on connect
    if (socket.data.userId) {
      emitPollStatusToSocket(socket);
    }

    socket.on('disconnect', (reason) => {
      console.log('[socket] client disconnected', {
        id: socket.id,
        userId: socket.data.userId || null,
        email: socket.data.email || null,
        reason
      });
    });
  });

  console.log('[socket] Socket.IO attached; waiting for clients');
  return io;
}

function getIo() {
  return io;
}

function emit(event, data) {
  if (io) {
    io.emit(event, data);
  }
}

function emitToUserId(userId, event, data) {
  if (io && userId) {
    io.to(roomForUserId(userId)).emit(event, data);
  }
}

function emitToEmail(email, event, data) {
  if (io && email) {
    io.to(roomForEmail(email)).emit(event, data);
  }
}

module.exports = {
  attachToHttpServer,
  getIo,
  emit,
  emitToUserId,
  emitToEmail,
  roomForUserId,
  roomForEmail
};
