/**
 * Socket.IO events (from browser / Postman client):
 *
 * 1) schedule:appointments:save / get — Redis per logged-in user
 *
 * 2) fasah:land-schedule:poll:start — one loop system-wide; 429 if another user is polling
 *    Requires app JWT (socket:identify). Events go to all sockets in user:<userId>.
 *
 * 3) fasah:land-schedule:poll:stop | poll:close — stop this user's poll
 * 4) fasah:land-schedule:poll:status — current poll state (for reconnect / second tab)
 */

const { getRedis } = require('./redisClient');
const {
  mergeAppointments,
  parseStored,
  redisKeyForUser,
  APPOINTMENTS_TTL_SEC
} = require('./scheduleAppointmentsStore');
const {
  startUserPoll,
  stopUserPoll,
  isPollActive,
  getPollStatusPayload,
  stopPollIfUserDisconnected
} = require('./landSchedulePollManager');

function requireIdentifiedUser(socket) {
  if (!socket.data.userId) {
    return {
      ok: false,
      message: 'Login required: connect with app JWT (auth.token) and socket:identify first'
    };
  }
  return { ok: true, userId: String(socket.data.userId) };
}

function register(socket) {
  socket.on('disconnect', () => {
    const userId = socket.data.userId;
    if (userId) {
      stopPollIfUserDisconnected(userId).catch((err) => {
        console.warn('[poll] disconnect check failed', userId, err.message || err);
      });
    }
  });

  socket.on('schedule:appointments:save', async (payload) => {
    try {
      const auth = requireIdentifiedUser(socket);
      if (!auth.ok) {
        socket.emit('schedule:appointments:error', { message: auth.message });
        return;
      }
      const redis = getRedis();
      if (!redis) {
        socket.emit('schedule:appointments:error', {
          message: 'Redis disabled (REDIS_URL=off).'
        });
        return;
      }
      const key = redisKeyForUser(auth.userId);
      const existingRaw = await redis.get(key);
      const existingParsed = parseStored(existingRaw);
      const { appointments, count } = mergeAppointments(existingParsed, payload);
      const merged = { appointments, userId: auth.userId, email: socket.data.email || null };
      const body = JSON.stringify(merged);
      await redis.set(key, body, 'EX', APPOINTMENTS_TTL_SEC);
      console.log('[redis] schedule:appointments:save', { userId: auth.userId, key, count });
      socket.emit('schedule:appointments:saved', {
        success: true,
        userId: auth.userId,
        email: socket.data.email || null,
        key,
        count,
        appointments,
        ttlSeconds: APPOINTMENTS_TTL_SEC
      });
    } catch (err) {
      socket.emit('schedule:appointments:error', { message: err.message || String(err) });
    }
  });

  socket.on('schedule:appointments:get', async () => {
    try {
      const auth = requireIdentifiedUser(socket);
      if (!auth.ok) {
        socket.emit('schedule:appointments:error', { message: auth.message });
        return;
      }
      const redis = getRedis();
      if (!redis) {
        socket.emit('schedule:appointments:error', {
          message: 'Redis disabled (REDIS_URL=off).'
        });
        return;
      }
      const key = redisKeyForUser(auth.userId);
      const raw = await redis.get(key);
      if (raw == null) {
        socket.emit('schedule:appointments:data', {
          userId: auth.userId,
          email: socket.data.email || null,
          key,
          raw: null,
          parsed: null,
          count: 0,
          appointments: []
        });
        return;
      }
      const parsed = parseStored(raw);
      const appointments = Array.isArray(parsed?.appointments) ? parsed.appointments : [];
      socket.emit('schedule:appointments:data', {
        userId: auth.userId,
        email: socket.data.email || null,
        key,
        raw,
        parsed: parsed === undefined ? null : parsed,
        count: appointments.length,
        appointments
      });
    } catch (err) {
      socket.emit('schedule:appointments:error', { message: err.message || String(err) });
    }
  });

  socket.on('fasah:land-schedule:poll:start', (payload) => {
    const auth = requireIdentifiedUser(socket);
    if (!auth.ok) {
      socket.emit('fasah:land-schedule:poll:error', { message: auth.message });
      return;
    }

    const result = startUserPoll(auth.userId, payload);
    if (!result.ok) {
      socket.emit('fasah:land-schedule:poll:error', {
        message: result.message,
        status: result.status,
        at: new Date().toISOString()
      });
    }
  });

  socket.on('fasah:land-schedule:poll:status', () => {
    const auth = requireIdentifiedUser(socket);
    if (!auth.ok) {
      socket.emit('fasah:land-schedule:poll:error', { message: auth.message });
      return;
    }
    socket.emit('fasah:land-schedule:poll:status', getPollStatusPayload(auth.userId));
  });

  function onLandPollStop() {
    const auth = requireIdentifiedUser(socket);
    if (!auth.ok) {
      socket.emit('fasah:land-schedule:poll:error', { message: auth.message });
      return;
    }
    if (!stopUserPoll(auth.userId, 'manual')) {
      socket.emit('fasah:land-schedule:poll:error', { message: 'No poll running for this user' });
    }
  }

  socket.on('fasah:land-schedule:poll:stop', onLandPollStop);
  socket.on('fasah:land-schedule:poll:close', onLandPollStop);
}

module.exports = { register, isPollActive, getPollStatusPayload };
