/**
 * At most one land-schedule poll system-wide (any user).
 * Per-user: events go to room user:<userId> (all tabs for that user).
 * Another user starting while one poll runs gets HTTP-style status 429.
 */

const FasahClient = require('./fasahClient');
const { hasUsableLandSchedules } = require('./landSchedulePollUtils');
const {
  extractLandSchedules,
  extractBookableZoneScheduleIds
} = require('./landScheduleExtract');
const { runAutoTransitBookForAllUsersWithPending } = require('./autoTransitBookingService');
const { hasUnresolvedBookingsGlobally } = require('./scheduleAppointmentsService');
const { roomForUserId } = require('./socketAuth');

const fasahClient = new FasahClient();

const DEFAULT_POLL_MS = 3000;
const DEFAULT_MAX_REQUESTS = 200;
const POLL_REQUEST_TIMEOUT_MS = Math.min(
  120000,
  Math.max(5000, Number(process.env.FASAH_POLL_REQUEST_TIMEOUT_MS) || 20000)
);

/** @type {Map<string, object>} */
const pollsByUserId = new Map();

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

function getPoll(userId) {
  return pollsByUserId.get(String(userId));
}

function isPollActive(userId) {
  const entry = getPoll(userId);
  return Boolean(entry?.active);
}

/** First active poll in the process (only one should exist). */
function getGlobalActivePoll() {
  for (const [ownerUserId, entry] of pollsByUserId) {
    if (entry?.active) {
      return { ownerUserId: String(ownerUserId), entry };
    }
  }
  return null;
}

function isSystemPollBusy(forUserId) {
  const global = getGlobalActivePoll();
  if (!global) {
    return { busy: false };
  }
  if (forUserId != null && global.ownerUserId === String(forUserId)) {
    return { busy: false, ownerUserId: global.ownerUserId };
  }
  return { busy: true, ownerUserId: global.ownerUserId };
}

function clearPollTimers(entry) {
  if (!entry) return;
  entry.active = false;
  if (entry.timer != null) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  if (typeof entry.waitResolve === 'function') {
    const r = entry.waitResolve;
    entry.waitResolve = null;
    r();
  }
}

function emitPoll(userId, event, data) {
  const { emitToUserId } = require('./socketService');
  emitToUserId(String(userId), event, {
    userId: String(userId),
    ...data
  });
}

function stopUserPoll(userId, reason) {
  const uid = String(userId);
  const entry = pollsByUserId.get(uid);
  if (!entry?.active) {
    return false;
  }

  const requestCount = entry.requestCount || 0;
  const maxRequests = entry.maxRequests ?? DEFAULT_MAX_REQUESTS;
  clearPollTimers(entry);
  pollsByUserId.delete(uid);

  console.log('[poll] stopped', { userId: uid, reason, requestCount, maxRequests });

  emitPoll(uid, 'fasah:land-schedule:poll:stopped', {
    at: new Date().toISOString(),
    reason,
    requestCount,
    maxRequests
  });
  broadcastPollStatusToAllSockets();
  return true;
}

function getPollStatusPayload(userId) {
  const uid = String(userId);
  const entry = getPoll(uid);
  const global = getGlobalActivePoll();

  if (entry?.active) {
    return {
      active: true,
      userId: uid,
      requestNumber: entry.requestCount || 0,
      maxRequests: entry.maxRequests ?? DEFAULT_MAX_REQUESTS,
      intervalMs: entry.intervalMs ?? DEFAULT_POLL_MS,
      startedAt: entry.startedAt || null,
      systemPollActive: true,
      isOwner: true
    };
  }

  if (global && global.ownerUserId !== uid) {
    const ownerEntry = global.entry;
    return {
      active: false,
      userId: uid,
      requestNumber: ownerEntry?.requestCount || 0,
      maxRequests: ownerEntry?.maxRequests ?? DEFAULT_MAX_REQUESTS,
      intervalMs: ownerEntry?.intervalMs ?? DEFAULT_POLL_MS,
      startedAt: ownerEntry?.startedAt || null,
      systemPollActive: true,
      isOwner: false,
      pollOwnerUserId: global.ownerUserId,
      status: 429,
      message: 'Polling already running'
    };
  }

  return {
    active: false,
    userId: uid,
    requestNumber: 0,
    maxRequests: DEFAULT_MAX_REQUESTS,
    intervalMs: DEFAULT_POLL_MS,
    systemPollActive: Boolean(global),
    isOwner: false,
    pollOwnerUserId: null
  };
}

/** Poll status for REST login response or API. */
function getPollStatusForApi(userId) {
  return {
    at: new Date().toISOString(),
    ...getPollStatusPayload(userId)
  };
}

/** Push current poll status to one socket (on connect / identify). */
function emitPollStatusToSocket(socket) {
  if (!socket?.data?.userId) {
    return;
  }
  const payload = getPollStatusPayload(socket.data.userId);
  console.log('[poll] emitPollStatusToSocket', payload);
  socket.emit('fasah:land-schedule:poll:status', {
    at: new Date().toISOString(),
    ...payload
  });
  return payload;
}

/** Notify every identified connected socket (after poll start/stop). */
function broadcastPollStatusToAllSockets() {
  const { getIo } = require('./socketService');
  const io = getIo();
  if (!io) {
    return;
  }
  const at = new Date().toISOString();
  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.userId) {
      socket.emit('fasah:land-schedule:poll:status', {
        at,
        ...getPollStatusPayload(socket.data.userId)
      });
    }
  }
}

async function sleepInterval(entry, intervalMs) {
  await new Promise((resolve) => {
    entry.waitResolve = resolve;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      if (entry.waitResolve === resolve) {
        entry.waitResolve = null;
      }
      resolve();
    }, intervalMs);
  });
}

async function runPollLoop(userId) {
  const uid = String(userId);
  const entry = pollsByUserId.get(uid);
  if (!entry?.active) {
    return;
  }

  const { paramsBase, maxRequests, intervalMs } = entry;

  try {
    while (entry.active) {
      if (entry.requestCount >= maxRequests) {
        stopUserPoll(uid, 'max_requests');
        break;
      }

      entry.requestCount += 1;
      const requestNumber = entry.requestCount;
      console.log('[poll] request start', uid, requestNumber, '/', maxRequests);

      emitPoll(uid, 'fasah:land-schedule:poll:progress', {
        at: new Date().toISOString(),
        phase: 'fetching',
        requestNumber,
        maxRequests,
        active: true
      });

      const t0 = Date.now();
      try {
        const data = await fetchLandScheduleForPoll(paramsBase);
        console.log('[poll] request done', uid, requestNumber, `${Date.now() - t0}ms`);

        if (!entry.active) {
          break;
        }

        const hasSchedules = hasUsableLandSchedules(data);

        if (!hasSchedules && data?.success === false) {
          console.log('[poll] no schedules (FASAH success:false), continuing', requestNumber);
        }

        const bookableIds = hasSchedules ? extractBookableZoneScheduleIds(data) : [];

        emitPoll(uid, 'fasah:land-schedule:poll:tick', {
          at: new Date().toISOString(),
          requestNumber,
          maxRequests,
          hasSchedules: bookableIds.length > 0,
          scheduleCount: bookableIds.length,
          stillPolling: true,
          durationMs: Date.now() - t0
        });

        if (bookableIds.length > 0) {
          const { headerMsg } = extractLandSchedules(data);

          emitPoll(uid, 'fasah:land-schedule:poll:data', {
            at: new Date().toISOString(),
            requestNumber,
            maxRequests,
            schedules: bookableIds,
            count: bookableIds.length,
            headerMsg: headerMsg || ''
          });

          console.log('[poll] schedules found', uid, {
            scheduleCount: bookableIds.length,
            autoBook: entry.autoBook === true
          });

          if (entry.autoBook === true) {
            try {
              console.log('[poll] auto-book starting', uid);
              await triggerAutoBookAfterSchedules(uid, data, paramsBase, entry);
              console.log('[poll] auto-book finished', uid);
            } catch (err) {
              console.error('[poll] auto-book failed', uid, err.message || err, err.stack);
              emitPoll(uid, 'fasah:land-schedule:auto-book:error', {
                at: new Date().toISOString(),
                message: err.message || String(err)
              });
            }

            const unresolved = await hasUnresolvedBookingsGlobally();
            if (!unresolved.hasUnresolved) {
              console.log('[poll] all bookings resolved — stopping', uid);
              stopUserPoll(uid, 'all_bookings_resolved');
              break;
            }

            console.log('[poll] schedules found but queue still open — keep polling', {
              userId: uid,
              unresolvedCount: unresolved.unresolvedCount,
              userIds: unresolved.userIds
            });
            emitPoll(uid, 'fasah:land-schedule:poll:tick', {
              at: new Date().toISOString(),
              requestNumber,
              maxRequests,
              hasSchedules: true,
              stillPolling: true,
              bookingsPending: true,
              unresolvedCount: unresolved.unresolvedCount
            });
          }
        } else if (hasSchedules && bookableIds.length === 0) {
          console.log('[poll] raw schedules but none bookable after filter', uid, requestNumber);
        }
      } catch (err) {
        console.log('[poll] request error, continuing', uid, requestNumber, err.message || err);
        if (!entry.active) {
          break;
        }
        emitPoll(uid, 'fasah:land-schedule:poll:error', {
          at: new Date().toISOString(),
          requestNumber,
          maxRequests,
          message: err.message || String(err),
          status: err.status
        });
      }

      if (!entry.active) {
        break;
      }

      if (entry.requestCount >= maxRequests) {
        stopUserPoll(uid, 'max_requests');
        break;
      }

      await sleepInterval(entry, intervalMs);
    }
  } catch (err) {
    console.error('[poll] loop error', uid, err);
    emitPoll(uid, 'fasah:land-schedule:poll:error', {
      at: new Date().toISOString(),
      message: err.message || String(err)
    });
    stopUserPoll(uid, 'error');
  }
}

async function triggerAutoBookAfterSchedules(userId, landScheduleData, paramsBase) {
  const { schedules, headerMsg } = extractLandSchedules(landScheduleData);
  console.log('[poll] triggerAutoBookAfterSchedules', userId, {
    scheduleCount: schedules.length,
    hasToken: Boolean(paramsBase?.token)
  });

  emitPoll(userId, 'fasah:land-schedule:auto-book:started', {
    at: new Date().toISOString(),
    scheduleCount: schedules.length,
    headerMsg
  });

  const summary = await runAutoTransitBookForAllUsersWithPending({
    landScheduleData,
    fasahToken: paramsBase.token,
    userType: paramsBase.userType,
    onProgress: (progress) => {
      const targetUserId = progress.userId || userId;
      emitPoll(targetUserId, 'fasah:land-schedule:auto-book:progress', {
        at: new Date().toISOString(),
        ...progress
      });
    },
    onBooked: (payload) => {
      const targetUserId = payload.userId || userId;
      emitPoll(targetUserId, 'schedule:appointment:booked', {
        success: true,
        ...payload
      });
    },
    onFailed: (payload) => {
      const targetUserId = payload.userId || userId;
      emitPoll(targetUserId, 'schedule:appointment:failed', {
        success: false,
        ...payload
      });
    }
  });

  const unresolved = await hasUnresolvedBookingsGlobally();
  console.log('[poll] auto-book summary', userId, {
    ok: summary.ok,
    message: summary.message,
    userCount: summary.userIds?.length ?? 1,
    booked: summary.booked?.length ?? 0,
    failed: summary.failed?.length ?? 0,
    retried: summary.retried?.length ?? 0,
    skipped: summary.skipped?.length ?? 0,
    unresolvedCount: unresolved.unresolvedCount
  });

  emitPoll(userId, 'fasah:land-schedule:auto-book:done', {
    at: new Date().toISOString(),
    ...summary
  });
  return summary;
}

/**
 * Start poll for user. Returns { ok, message? }.
 */
function startUserPoll(userId, payload) {
  const uid = String(userId);

  if (isPollActive(uid)) {
    return {
      ok: false,
      status: 409,
      message: 'Poll already running for this user'
    };
  }

  const systemBusy = isSystemPollBusy(uid);
  if (systemBusy.busy) {
    console.log('[poll] rejected start (system busy)', { userId: uid, ownerUserId: systemBusy.ownerUserId });
    return {
      ok: false,
      status: 429,
      message: 'Polling already running'
    };
  }

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
    return { ok: false, status: 400, message: 'Missing required fields' + (!departure ? ' departure' : '') + (!arrival ? ' arrival' : '') + (!type ? ' type' : '') + (!token ? ' token' : '') + (!userType ? ' userType' : '')};
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

  const entry = {
    active: true,
    userId: uid,
    requestCount: 0,
    maxRequests,
    intervalMs,
    paramsBase,
    /** Server auto-book only when explicitly true; default = push poll:data to frontend. */
    autoBook: payload?.autoBook === true,
    timer: null,
    waitResolve: null,
    startedAt: new Date().toISOString()
  };

  pollsByUserId.set(uid, entry);

  emitPoll(uid, 'fasah:land-schedule:poll:started', {
    intervalMs,
    maxRequests,
    autoBook: entry.autoBook
  });
  console.log('[poll] started', uid, { intervalMs, maxRequests, autoBook: entry.autoBook });
  broadcastPollStatusToAllSockets();

  runPollLoop(uid).catch((err) => {
    console.error('[poll] unhandled', uid, err);
    stopUserPoll(uid, 'error');
  });

  return { ok: true, intervalMs, maxRequests };
}

/** Stop poll when user has no connected sockets (optional cleanup). */
async function stopPollIfUserDisconnected(userId) {
  const { getIo } = require('./socketService');
  const io = getIo();
  const uid = String(userId);
  if (!io || !isPollActive(uid)) {
    return;
  }
  const sockets = await io.in(roomForUserId(uid)).fetchSockets();
  if (sockets.length === 0) {
    stopUserPoll(uid, 'disconnect');
  }
}

module.exports = {
  startUserPoll,
  stopUserPoll,
  isPollActive,
  getGlobalActivePoll,
  isSystemPollBusy,
  getPollStatusPayload,
  getPollStatusForApi,
  emitPollStatusToSocket,
  broadcastPollStatusToAllSockets,
  stopPollIfUserDisconnected
};
