/**
 * Auto-book transit appointments for one user:
 * 1) schedules from poll / payload
 * 2) pending rows from Redis (frontend shape: submitData without token on create)
 * 3) parallel createTransitAppointment — one concurrent request per platform proxy
 */

const { getRedis } = require('./redisClient');
const {
  parseStored,
  redisKeyForUser,
  APPOINTMENTS_TTL_SEC,
  appointmentKey
} = require('./scheduleAppointmentsStore');
const {
  loadAppointmentsForUser,
  listUserIdsWithPendingAppointments
} = require('./scheduleAppointmentsService');
const { extractLandSchedules, pickSlotForAppointment } = require('./landScheduleExtract');
const {
  hasBookingPayload,
  buildTransitCreateBody,
  applyBookedState,
  sanitizeAppointmentForClient,
  normalizeAppointmentForRedis,
  resolveFasahBearer,
  needsBooking,
  applyBookingAttemptFailure,
  MAX_BOOKING_ATTEMPTS
} = require('./appointmentBookingShape');
const { executeTransitBooking, client: fasahClient } = require('./transitBookingCore');
const User = require('../routes/models/User');

function isPendingAppointment(apt) {
  return needsBooking(apt);
}

async function persistAppointments(userId, appointments, email) {
  const redis = getRedis();
  if (!redis) {
    throw new Error('Redis disabled (REDIS_URL=off).');
  }
  const key = redisKeyForUser(userId);
  const body = JSON.stringify({
    appointments,
    userId: String(userId),
    email: email || null
  });
  await redis.set(key, body, 'EX', APPOINTMENTS_TTL_SEC);
}

/**
 * @param {string} userId
 * @param {object} options
 * @param {function} [options.onProgress]
 * @param {function} [options.onBooked] — ({ appointmentId, appointment, tasBookRef, slot })
 * @param {function} [options.onFailed] — ({ appointmentId, appointment, message })
 */
async function runAutoTransitBookForUser(userId, options = {}) {
  console.log('[autoTransitBookingService] runAutoTransitBookForUser', userId, options);
  const uid = String(userId);
  let fasahToken = options.fasahToken || options.token;

  const { schedules, headerMsg } = options.schedules
    ? { schedules: options.schedules, headerMsg: options.headerMsg || '' }
    : extractLandSchedules(options.landScheduleData);

  if (!schedules.length) {
    return { ok: false, status: 400, message: 'No schedules available to book' };
  }

  const stored = await loadAppointmentsForUser(uid);
  const pending = (stored.appointments || []).filter(needsBooking);

  if (!fasahToken && pending.length) {
    for (const apt of pending) {
      const bearer = resolveFasahBearer(apt);
      if (bearer) {
        fasahToken = bearer;
        break;
      }
    }
  }

  if (!fasahToken) {
    return { ok: false, status: 400, message: 'FASAH token required (fasahToken or token on appointment)' };
  }

  console.log('[auto-book] queue', {
    userId: uid,
    scheduleCount: schedules.length,
    totalStored: (stored.appointments || []).length,
    pendingCount: pending.length
  });

  if (!pending.length) {
    console.warn('[auto-book] skipped — no pending appointments in Redis', {
      userId: uid,
      hint: 'Call schedule:appointments:save with pending jobs before poll:start'
    });
    return {
      ok: true,
      message: 'No pending appointments in queue',
      schedules,
      headerMsg,
      booked: [],
      failed: [],
      skipped: []
    };
  }

  const proxies = fasahClient.getPlatformProxies();
  const concurrency = Math.max(
    1,
    Math.min(pending.length, options.concurrency || proxies.length || 1)
  );

  const mongoUser = await User.findById(uid).select('_id email');
  const proxyContext = mongoUser || { _id: uid };

  const booked = [];
  const failed = [];
  const retried = [];
  const skipped = [];
  const updatedById = new Map((stored.appointments || []).map((a) => [appointmentKey(a), { ...a }]));

  let taskIndex = 0;
  const total = pending.length;

  for (let waveStart = 0; waveStart < pending.length; waveStart += concurrency) {
    const wave = pending.slice(waveStart, waveStart + concurrency);

    const waveResults = await Promise.all(
      wave.map(async (appointment, waveOffset) => {
        const proxyIndex = (waveStart + waveOffset) % Math.max(proxies.length, 1);
        const appointmentId = appointmentKey(appointment) || `idx_${waveStart + waveOffset}`;
        taskIndex += 1;

        if (options.onProgress) {
          options.onProgress({
            userId: uid,
            index: taskIndex,
            total,
            appointmentId,
            phase: 'matching'
          });
        }

        if (!hasBookingPayload(appointment)) {
          return {
            appointmentId,
            ok: false,
            skipped: true,
            sourceAppointment: appointment,
            message:
              'Missing submitData (declaration_number, purpose, fleet_info) or legacy booking fields'
          };
        }

        const slot = pickSlotForAppointment(schedules, appointment);
        if (!slot) {
          return {
            appointmentId,
            ok: false,
            skipped: true,
            sourceAppointment: appointment,
            message: 'No matching bookable slot in schedules'
          };
        }

        const body = buildTransitCreateBody(appointment, slot, fasahToken, options.userType);

        if (options.onProgress) {
          options.onProgress({
            userId: uid,
            index: taskIndex,
            total,
            appointmentId,
            phase: 'booking',
            zone_schedule_id: slot.zone_schedule_id,
            proxyIndex
          });
        }

        try {
          const result = await executeTransitBooking({
            mongoUserId: uid,
            appointmentId,
            body,
            proxyIndex,
            proxyContext,
            endpoint: '/socket/fasah:land-schedule:auto-book'
          });

          return {
            appointmentId,
            ok: result.success,
            result,
            slot,
            body,
            proxyIndex,
            sourceAppointment: appointment
          };
        } catch (err) {
          console.error('[booking] auto-book exception', {
            userId: uid,
            appointmentId,
            proxyIndex,
            message: err.message || String(err),
            status: err.status
          });
          return {
            appointmentId,
            ok: false,
            result: {
              success: false,
              message: err.message || String(err),
              httpStatus: err.status || 500
            },
            slot,
            proxyIndex,
            sourceAppointment: appointment
          };
        }
      })
    );

    for (const item of waveResults) {
      const key = item.appointmentId;
      const prev = updatedById.get(key) || {};

      if (item.skipped) {
        const { record, isFinalFailure, attempts } = applyBookingAttemptFailure(
          item.sourceAppointment || prev,
          item.message
        );
        updatedById.set(key, record);
        skipped.push({ appointmentId: key, message: item.message, attempts, isFinalFailure });
        if (isFinalFailure) {
          failed.push({ appointmentId: key, message: item.message, attempts, appointment: record });
          if (options.onFailed) {
            options.onFailed({
              userId: uid,
              appointmentId: key,
              message: item.message,
              attempts,
              final: true,
              appointment: record
            });
          }
        } else {
          retried.push({ appointmentId: key, message: item.message, attempts });
        }
        continue;
      }

      if (item.ok && item.result?.success) {
        const record = applyBookedState(item.sourceAppointment || prev, {
          slot: item.slot,
          tasBookRef: item.result.tasBookRef
        });
        updatedById.set(key, record);

        booked.push({
          appointmentId: key,
          tasBookRef: item.result.tasBookRef,
          zone_schedule_id: item.slot?.zone_schedule_id,
          schedule_from: item.slot?.schedule_from,
          proxyIndex: item.proxyIndex,
          appointment: record
        });

        if (options.onBooked) {
          options.onBooked({
            userId: uid,
            appointmentId: key,
            tasBookRef: item.result.tasBookRef,
            slot: item.slot,
            appointment: record
          });
        }
      } else {
        const errMsg = item.result?.message || 'Booking failed';
        const { record, isFinalFailure, attempts } = applyBookingAttemptFailure(
          item.sourceAppointment || prev,
          errMsg
        );
        updatedById.set(key, record);

        if (isFinalFailure) {
          failed.push({
            appointmentId: key,
            message: errMsg,
            attempts,
            proxyIndex: item.proxyIndex,
            appointment: record
          });
          if (options.onFailed) {
            options.onFailed({
              userId: uid,
              appointmentId: key,
              message: errMsg,
              attempts,
              final: true,
              appointment: record
            });
          }
        } else {
          retried.push({
            appointmentId: key,
            message: errMsg,
            attempts,
            proxyIndex: item.proxyIndex
          });
        }
      }

      if (options.onProgress) {
        options.onProgress({
          userId: uid,
          index: taskIndex,
          total,
          appointmentId: key,
          phase: 'done',
          success: Boolean(item.ok && item.result?.success)
        });
      }
    }
  }

  const appointments = Array.from(updatedById.values()).map(normalizeAppointmentForRedis);
  await persistAppointments(uid, appointments, mongoUser?.email || stored.email);

  return {
    ok: true,
    userId: uid,
    schedules,
    headerMsg,
    concurrency,
    proxyCount: proxies.length,
    booked,
    failed,
    retried,
    skipped,
    maxBookingAttempts: MAX_BOOKING_ATTEMPTS,
    appointments
  };
}

/**
 * When schedules are available, book pending queue rows for every user with Redis appointments.
 * @param {object} options — same as runAutoTransitBookForUser (landScheduleData, fasahToken, callbacks)
 */
async function runAutoTransitBookForAllUsersWithPending(options = {}) {
  const userIds = await listUserIdsWithPendingAppointments();
  console.log('[auto-book] all users with pending', { count: userIds.length, userIds });

  if (!userIds.length) {
    const { schedules, headerMsg } = options.schedules
      ? { schedules: options.schedules, headerMsg: options.headerMsg || '' }
      : extractLandSchedules(options.landScheduleData);
    return {
      ok: true,
      message: 'No users with pending appointments',
      userIds: [],
      users: [],
      schedules,
      headerMsg,
      booked: [],
      failed: [],
      skipped: []
    };
  }

  const users = [];
  const booked = [];
  const failed = [];
  const retried = [];
  const skipped = [];

  for (const userId of userIds) {
    const summary = await runAutoTransitBookForUser(userId, options);
    users.push(summary);
    if (Array.isArray(summary.booked)) booked.push(...summary.booked);
    if (Array.isArray(summary.failed)) failed.push(...summary.failed);
    if (Array.isArray(summary.retried)) retried.push(...summary.retried);
    if (Array.isArray(summary.skipped)) skipped.push(...summary.skipped);
  }

  const first = users[0] || {};
  return {
    ok: users.every((u) => u.ok !== false),
    userIds,
    users,
    schedules: first.schedules,
    headerMsg: first.headerMsg,
    booked,
    failed,
    retried,
    skipped,
    maxBookingAttempts: MAX_BOOKING_ATTEMPTS
  };
}

module.exports = {
  runAutoTransitBookForUser,
  runAutoTransitBookForAllUsersWithPending,
  isPendingAppointment,
  needsBooking,
  buildTransitCreateBody: buildTransitCreateBody,
  sanitizeAppointmentForClient
};
