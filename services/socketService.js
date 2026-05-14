const { Server } = require('socket.io');
const { register: registerScheduleSocketHandlers } = require('./socketScheduleHandlers');

let io = null;

/** Attach Socket.IO once to the shared HTTP server. */
function attachToHttpServer(httpServer) {
  if (io) {
    return io;
  }
  io = new Server(httpServer, {
    cors: { origin: true, methods: ['GET', 'POST'] }
  });

  io.on('connection', (socket) => {
    // Handshake finished: transport is open and client is on the default namespace.
    console.log('[socket] connection opened, client connected', {
      id: socket.id,
      transport: socket.conn.transport.name
    });
    registerScheduleSocketHandlers(socket);
    socket.on('disconnect', (reason) => {
      console.log('[socket] client disconnected', { id: socket.id, reason });
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

module.exports = {
  attachToHttpServer,
  getIo,
  emit
};
