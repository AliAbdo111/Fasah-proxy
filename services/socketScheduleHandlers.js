/**
 * Socket.IO events (from browser / Postman client):
 *
 * 1) schedule:appointments:save — merges into Redis list (same id replaces; new ids append)
 *    schedule:appointments:get — returns full merged list for this socket
 *
 * 2) fasah:land-schedule:poll:start
 *    payload: { departure, arrival, type, token, userType?, economicOperator?, intervalMs?, maxRequests? }
 *    → one loop per socket; second start while running → poll:error "Poll already running"
 *    → getLandSchedule every intervalMs (default 3000). Stops when:
 *       (a) client emits fasah:land-schedule:poll:stop | poll:close  → reason: manual
 *       (b) request count reaches maxRequests (default 200)         → reason: max_requests
 *       (c) response has usable schedules[]                         → reason: schedules_found
 *    ← poll:started | poll:progress | poll:tick | poll:error | poll:stopped { reason, requestCount, maxRequests }
 *
 * 3) fasah:land-schedule:poll:stop | fasah:land-schedule:poll:close — manual stop (case 3)
 */

const FasahClient = require('./fasahClient');
const { getRedis } = require('./redisClient');
const { hasUsableLandSchedules } = require('./landSchedulePollUtils');
const { mergeAppointments, parseStored } = require('./scheduleAppointmentsStore');

const fasahClient = new FasahClient();

const DEFAULT_POLL_MS = 3000;
const DEFAULT_MAX_REQUESTS = 200;
const POLL_REQUEST_TIMEOUT_MS = Math.min(
  120000,
  Math.max(5000, Number(process.env.FASAH_POLL_REQUEST_TIMEOUT_MS) || 20000)
);

function fetchLandScheduleForPoll(paramsBase) {
  return Promise.race([
    fasahClient.getLandSchedule(paramsBase),
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            new Error(
              `FASAH request timeout after ${POLL_REQUEST_TIMEOUT_MS}ms (slow or dead proxy — poll continues)`
            )
          ),
        POLL_REQUEST_TIMEOUT_MS
      );
    })
  ]);
}

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

function stopLandPoll(socket, reason) {
  const wasActive = Boolean(socket.data.landPollActive);
  const requestCount = socket.data.landPollRequestCount || 0;
  const maxRequests = socket.data.landPollMaxRequests ?? DEFAULT_MAX_REQUESTS;
  clearLandPoll(socket);
  if (!wasActive) {
    return;
  }
  console.log('[poll] stopped', {
    socketId: socket.id,
    reason,
    requestCount,
    maxRequests,
    connected: socket.connected
  });
  if (socket.connected) {
    socket.emit('fasah:land-schedule:poll:stopped', {
      at: new Date().toISOString(),
      reason,
      requestCount,
      maxRequests
    });
  }
}

function register(socket) {
  socket.on('disconnect', () => {
    if (socket.data.landPollActive) {
      stopLandPoll(socket, 'disconnect');
    } else {
      clearLandPoll(socket);
    }
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
      const key = `fasah:socket:${socket.id}:schedule-appointments`;
      const existingRaw = await redis.get(key);
      const existingParsed = parseStored(existingRaw);
      const { appointments, count } = mergeAppointments(existingParsed, payload);
      const merged = { appointments };
      const body = JSON.stringify(merged);
      await redis.set(key, body, 'EX', 60 * 60 * 24 * 7);
      console.log('[redis] schedule:appointments:save', key, { count });
      socket.emit('schedule:appointments:saved', {
        success: true,
        key,
        count,
        appointments,
        ttlSeconds: 60 * 60 * 24 * 7
      });
    } catch (err) {
      socket.emit('schedule:appointments:error', { message: err.message || String(err) });
    }
  });

  socket.on('schedule:appointments:get', async () => {
    try {
      const redis = getRedis();
      if (!redis) {
        socket.emit('schedule:appointments:error', {
          message: 'Redis disabled (REDIS_URL=off).'
        });
        return;
      }
      const key = `fasah:socket:${socket.id}:schedule-appointments`;
      const raw = await redis.get(key);
      if (raw == null) {
        socket.emit('schedule:appointments:data', { key, raw: null, parsed: null });
        return;
      }
      const parsed = parseStored(raw);
      const appointments = Array.isArray(parsed?.appointments) ? parsed.appointments : [];
      socket.emit('schedule:appointments:data', {
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

  socket.on('fasah:land-schedule:poll:start', async (payload) => {
    if (socket.data.landPollActive) {
      socket.emit('fasah:land-schedule:poll:error', {
        message: 'Poll already running'
      });
      return;
    }
    socket.data.landPollActive = true;

    const intervalMs = Math.min(
      60000,
      Math.max(1000, Number(payload?.intervalMs) || DEFAULT_POLL_MS)
    );

    const maxRequests = Math.min(
      200,
      Math.max(1, Number(payload?.maxRequests) || DEFAULT_MAX_REQUESTS)
    );

    const { departure, arrival, type, token, userType, economicOperator } = payload || {};

    if (!departure || !arrival || !type || !token) {
      clearLandPoll(socket);
      socket.emit('fasah:land-schedule:poll:error', {
        message: 'Missing required fields'
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

    socket.data.landPollRequestCount = 0;
    socket.data.landPollMaxRequests = maxRequests;

    socket.emit('fasah:land-schedule:poll:started', { intervalMs, maxRequests });
    console.log('[poll] started', socket.id, { intervalMs, maxRequests });

    try {
      while (socket.data.landPollActive) {
        if (socket.data.landPollRequestCount >= maxRequests) {
          stopLandPoll(socket, 'max_requests');
          break;
        }

        socket.data.landPollRequestCount += 1;
        const requestNumber = socket.data.landPollRequestCount;
        console.log('[poll] request start', socket.id, requestNumber, '/', maxRequests);

        if (socket.connected) {
          socket.emit('fasah:land-schedule:poll:progress', {
            at: new Date().toISOString(),
            phase: 'fetching',
            requestNumber,
            maxRequests,
            active: true
          });
        }

        const t0 = Date.now();
        try {
          const data = await fetchLandScheduleForPoll(paramsBase);
          console.log('[poll] request done', socket.id, requestNumber, `${Date.now() - t0}ms`);

          if (!socket.data.landPollActive) {
            console.log('[poll] loop break: inactive after fetch', requestNumber);
            break;
          }

          const hasSchedules = hasUsableLandSchedules(data);

          if (!hasSchedules && data?.success === false) {
            console.log('[poll] no schedules (FASAH success:false), continuing', requestNumber);
          }

          if (socket.connected) {
            socket.emit('fasah:land-schedule:poll:tick', {
              at: new Date().toISOString(),
              requestNumber,
              maxRequests,
              hasSchedules,
              stillPolling: true,
              durationMs: Date.now() - t0,
              data
            });
          }

          if (hasSchedules) {
            stopLandPoll(socket, 'schedules_found');
            break;
          }
        } catch (err) {
          console.log('[poll] request error, continuing', requestNumber, `${Date.now() - t0}ms`, err.message || err);
          if (!socket.data.landPollActive) {
            break;
          }
          if (socket.connected) {
            socket.emit('fasah:land-schedule:poll:error', {
              at: new Date().toISOString(),
              requestNumber,
              maxRequests,
              message: err.message || String(err),
              status: err.status
            });
          }
        }

        if (!socket.data.landPollActive) {
          console.log('[poll] loop break: inactive before sleep', requestNumber);
          break;
        }

        if (socket.data.landPollRequestCount >= maxRequests) {
          stopLandPoll(socket, 'max_requests');
          break;
        }

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
    } catch (err) {
      console.error('[poll] loop error', socket.id, err);
      if (socket.connected) {
        socket.emit('fasah:land-schedule:poll:error', {
          at: new Date().toISOString(),
          message: err.message || String(err)
        });
      }
      stopLandPoll(socket, 'error');
    }
  });

  function onLandPollStop() {
    stopLandPoll(socket, 'manual');
  }

  socket.on('fasah:land-schedule:poll:stop', onLandPollStop);
  socket.on('fasah:land-schedule:poll:close', onLandPollStop);
}

module.exports = { register };
