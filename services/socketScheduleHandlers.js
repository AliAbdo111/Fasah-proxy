/**
 * Socket.IO events (from browser / Postman client):
 *
 * 1) schedule:appointments:save
 *    payload: any JSON-serializable object (e.g. { appointments: [...] })
 *    → stored in Redis key fasah:socket:<socketId>:schedule-appointments (TTL 7d)
 *    ← schedule:appointments:saved | schedule:appointments:error
 *
 * 2) fasah:land-schedule:poll:start
 *    payload: { departure, arrival, type, token, userType?, economicOperator?, intervalMs? }
 *    → calls FasahClient.getLandSchedule repeatedly: fetch, then wait intervalMs (default 3000 ms),
 *       until fasah:land-schedule:poll:stop or disconnect.
 *    ← fasah:land-schedule:poll:started | fasah:land-schedule:poll:tick | fasah:land-schedule:poll:error
 *
 * 3) fasah:land-schedule:poll:stop
 *    ← fasah:land-schedule:poll:stopped
 */

const FasahClient = require('./fasahClient');
const { getRedis } = require('./redisClient');

const fasahClient = new FasahClient();

function clearLandPoll(socket) {
  socket.data.landPollActive = false;
  if (socket.data.landPollTimer != null) {
    clearTimeout(socket.data.landPollTimer);
    socket.data.landPollTimer = null;
  }
  if (typeof socket.data.landPollWaitResolve === 'function') {
    const r = socket.data.landPollWaitResolve;
    socket.data.landPollWaitResolve = null;
    r();
  }
}

function register(socket) {
  socket.on('disconnect', () => {
    clearLandPoll(socket);
  });

  socket.on('schedule:appointments:save', async (payload) => {
    try {
      const redis = getRedis();
      if (!redis) {
        socket.emit('schedule:appointments:error', {
          message: 'Redis disabled (REDIS_URL=off).'
        });
        return;
      }
      const body = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
      const key = `fasah:socket:${socket.id}:schedule-appointments`;
      await redis.set(key, body, 'EX', 60 * 60 * 24 * 7);
      socket.emit('schedule:appointments:saved', {
        success: true,
        key,
        ttlSeconds: 60 * 60 * 24 * 7
      });
      console.log('[socket] schedule:appointments:saved', { key, ttlSeconds: 60 * 60 * 24 * 7 });
    } catch (err) {
      console.error('[socket] schedule:appointments:error', { message: err.message || String(err) });
      socket.emit('schedule:appointments:error', { message: err.message || String(err) });
    }
  });

  socket.on('fasah:land-schedule:poll:start', (payload) => {
    clearLandPoll(socket);

    const DEFAULT_POLL_MS = 3000;
    const intervalMs = Math.min(
      60000,
      Math.max(1000, Number(payload && payload.intervalMs) || DEFAULT_POLL_MS)
    );
    const { departure, arrival, type, token, userType, economicOperator } = payload || {};

    if (!departure || !arrival || !type || !token) {
      socket.emit('fasah:land-schedule:poll:error', {
        message: 'Missing departure, arrival, type, or token'
      });
      return;
    }

    const paramsBase = {
      departure,
      arrival,
      type,
      token,
      userType: userType || 'broker',
      ...(economicOperator && { economicOperator }),
      proxyContext: undefined
    };

    socket.data.landPollActive = true;
    socket.emit('fasah:land-schedule:poll:started', { intervalMs });

    (async function landPollLoop() {
      while (socket.data.landPollActive && socket.connected) {
        try {
          const data = await fasahClient.getLandSchedule(paramsBase);
          if (!socket.data.landPollActive || !socket.connected) break;
          socket.emit('fasah:land-schedule:poll:tick', {
            at: new Date().toISOString(),
            data
          });
        } catch (err) {
          if (!socket.data.landPollActive || !socket.connected) break;
          socket.emit('fasah:land-schedule:poll:error', {
            at: new Date().toISOString(),
            message: err.message || String(err),
            status: err.status
          });
        }

        if (!socket.data.landPollActive || !socket.connected) break;

        await new Promise((resolve) => {
          socket.data.landPollWaitResolve = resolve;
          socket.data.landPollTimer = setTimeout(() => {
            socket.data.landPollTimer = null;
            if (socket.data.landPollWaitResolve === resolve) {
              socket.data.landPollWaitResolve = null;
            }
            resolve();
          }, intervalMs);
        });
      }
    })().catch((err) => {
      console.error('[socket] fasah:land-schedule:poll loop', err);
      if (socket.connected) {
        socket.emit('fasah:land-schedule:poll:error', {
          at: new Date().toISOString(),
          message: err.message || String(err)
        });
      }
    });
  });

  socket.on('fasah:land-schedule:poll:stop', () => {
    clearLandPoll(socket);
    socket.emit('fasah:land-schedule:poll:stopped', { at: new Date().toISOString() });
  });
}

module.exports = { register };
