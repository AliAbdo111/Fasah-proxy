/**
 * Socket.IO events (from browser / Postman client):
 *
 * 1) schedule:appointments:save | get | delete — Redis per user; admin get via userId/email
 *
 * 2) fasah:land-schedule:poll:start — one loop system-wide; 429 if another user is polling
 *    Requires app JWT (socket:identify). Auto-books pending queue when schedules found (default).
 *    Events go to all sockets in user:<userId>.
 *
 * 3) fasah:land-schedule:poll:stop | poll:close — stop this user's poll
 * 4) fasah:land-schedule:poll:status — auto-emitted on connect (with JWT) + after socket:identify
 *
 * 5) schedule:appointment:booked | schedule:appointment:failed — per queue row after auto-book
 *    (all tabs in user:<userId>). Payload includes full appointment object (no bearer in submitData).
 */

const { getRedis } = require('./redisClient');
const {
  mergeAppointments,
  deleteAppointments,
  parseStored,
  redisKeyForUser,
  APPOINTMENTS_TTL_SEC
} = require('./scheduleAppointmentsStore');
const {
  loadAppointmentsForUser,
  resolveAppointmentsTarget
} = require('./scheduleAppointmentsService');
const {
  startUserPoll,
  stopUserPoll,
  isPollActive,
  getPollStatusPayload,
  emitPollStatusToSocket,
  stopPollIfUserDisconnected
} = require('./landSchedulePollManager');
const {
  runAutoTransitBookForUser,
  sanitizeAppointmentForClient
} = require('./autoTransitBookingService');
const { extractLandSchedules } = require('./landScheduleExtract');
const { emitToUserId } = require('./socketService');

function emitAutoBookToUser(userId, event, data) {
  emitToUserId(String(userId), event, {
    userId: String(userId),
    at: new Date().toISOString(),
    ...data
  });
}

function emitAppointmentBooked(userId, payload) {
  emitToUserId(String(userId), 'schedule:appointment:booked', {
    success: true,
    userId: String(userId),
    at: new Date().toISOString(),
    ...payload
  });
}

function emitAppointmentFailed(userId, payload) {
  emitToUserId(String(userId), 'schedule:appointment:failed', {
    success: false,
    userId: String(userId),
    at: new Date().toISOString(),
    ...payload
  });
}

function sanitizeAppointmentsList(list) {
  return (Array.isArray(list) ? list : []).map(sanitizeAppointmentForClient);
}

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
      const { appointments, count, saved } = mergeAppointments(existingParsed, payload);
      const sanitized = sanitizeAppointmentsList(appointments);
      const sanitizedSaved = sanitizeAppointmentsList(saved);
      const merged = {
        appointments: sanitized,
        userId: auth.userId,
        email: socket.data.email || null
      };
      const body = JSON.stringify(merged);
      await redis.set(key, body, 'EX', APPOINTMENTS_TTL_SEC);
      console.log('[redis] schedule:appointments:save', {
        userId: auth.userId,
        key,
        count,
        savedCount: saved.length
      });
      socket.emit('schedule:appointments:saved', {
        success: true,
        userId: auth.userId,
        email: socket.data.email || null,
        key,
        count,
        saved: sanitizedSaved,
        appointment: sanitizedSaved.length === 1 ? sanitizedSaved[0] : undefined,
        appointments: sanitized,
        ttlSeconds: APPOINTMENTS_TTL_SEC
      });
    } catch (err) {
      socket.emit('schedule:appointments:error', { message: err.message || String(err) });
    }
  });

  socket.on('schedule:appointments:get', async (payload, ack) => {
    try {
      const target = await resolveAppointmentsTarget(socket, payload);
      if (!target.ok) {
        const errBody = { success: false, message: target.message, status: target.status };
        if (typeof ack === 'function') ack(errBody);
        socket.emit('schedule:appointments:error', errBody);
        return;
      }

      const data = await loadAppointmentsForUser(target.targetUserId);
      const body = {
        success: true,
        ...data,
        email: data.email || target.targetEmail || socket.data.email || null,
        requestedBy: target.requestedBy,
        asAdmin: target.asAdmin,
        targetUserId: target.targetUserId
      };
      if (typeof ack === 'function') ack(body);
      socket.emit('schedule:appointments:data', body);
    } catch (err) {
      const errBody = {
        success: false,
        message: err.message || String(err),
        status: err.code === 'REDIS_OFF' ? 503 : undefined
      };
      if (typeof ack === 'function') ack(errBody);
      socket.emit('schedule:appointments:error', errBody);
    }
  });

  socket.on('schedule:appointments:delete', async (payload) => {
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
      const { appointments, count, deleted, deletedIds, notFoundIds } = deleteAppointments(
        existingParsed,
        payload
      );

      if (deletedIds.length === 0 && notFoundIds.length > 0) {
        socket.emit('schedule:appointments:error', {
          message: 'No matching appointments found to delete',
          notFoundIds
        });
        return;
      }

      const merged = { appointments, userId: auth.userId, email: socket.data.email || null };
      const body = JSON.stringify(merged);
      await redis.set(key, body, 'EX', APPOINTMENTS_TTL_SEC);
      console.log('[redis] schedule:appointments:delete', {
        userId: auth.userId,
        key,
        deletedIds,
        count
      });
      socket.emit('schedule:appointments:deleted', {
        success: true,
        userId: auth.userId,
        email: socket.data.email || null,
        key,
        deleted,
        deletedIds,
        notFoundIds,
        appointment: deleted.length === 1 ? deleted[0] : undefined,
        count,
        appointments,
        ttlSeconds: APPOINTMENTS_TTL_SEC
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
    emitPollStatusToSocket(socket);
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

  socket.on('fasah:land-schedule:auto-book', async (payload) => {
    const auth = requireIdentifiedUser(socket);
    if (!auth.ok) {
      socket.emit('fasah:land-schedule:auto-book:error', { message: auth.message });
      return;
    }

    const schedulesPayload = payload?.schedules
      ? { schedules: payload.schedules, headerMsg: payload.headerMsg }
      : extractLandSchedules(payload?.landScheduleData || payload?.data);

    if (!schedulesPayload.schedules.length) {
      socket.emit('fasah:land-schedule:auto-book:error', {
        message: 'No schedules in payload. Pass schedules[] or landScheduleData from poll:tick.'
      });
      return;
    }

    const fasahToken = payload?.token || payload?.fasahToken;
    if (!fasahToken) {
      socket.emit('fasah:land-schedule:auto-book:error', { message: 'FASAH token required' });
      return;
    }

    try {
      emitAutoBookToUser(auth.userId, 'fasah:land-schedule:auto-book:started', {
        scheduleCount: schedulesPayload.schedules.length
      });

      const summary = await runAutoTransitBookForUser(auth.userId, {
        schedules: schedulesPayload.schedules,
        headerMsg: schedulesPayload.headerMsg,
        fasahToken,
        userType: payload?.userType,
        concurrency: payload?.concurrency,
        onProgress: (progress) => {
          emitAutoBookToUser(auth.userId, 'fasah:land-schedule:auto-book:progress', progress);
        },
        onBooked: (p) => emitAppointmentBooked(auth.userId, p),
        onFailed: (p) => emitAppointmentFailed(auth.userId, p)
      });

      emitAutoBookToUser(auth.userId, 'fasah:land-schedule:auto-book:done', summary);
    } catch (err) {
      emitAutoBookToUser(auth.userId, 'fasah:land-schedule:auto-book:error', {
        message: err.message || String(err)
      });
    }
  });
}

module.exports = { register, isPollActive, getPollStatusPayload };
