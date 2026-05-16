/**
 * Auto-book transit appointments for one user:
 * 1) schedules from poll / payload
 * 2) pending rows from Redis (fasah:user:<id>:schedule-appointments)
 * 3) parallel createTransitAppointment — one concurrent request per platform proxy
 */

const { getRedis } = require('./redisClient');
const {
  parseStored,
  redisKeyForUser,
  APPOINTMENTS_TTL_SEC,
  appointmentKey
} = require('./scheduleAppointmentsStore');
const { loadAppointmentsForUser } = require('./scheduleAppointmentsService');
const { extractLandSchedules, pickSlotForAppointment } = require('./landScheduleExtract');
const { executeTransitBooking, client: fasahClient } = require('./transitBookingCore');
const User = require('../routes/models/User');

function isPendingAppointment(apt) {
  const status = String(apt?.status || 'pending').toLowerCase();
  return status !== 'booked' && status !== 'success' && status !== 'cancelled';
}

function buildBookingBody(appointment, slot, fasahToken, userType) {
  const token = fasahToken || appointment.token;
  return {
    port_code: appointment.port_code || slot.port_code || slot.zone_code,
    zone_schedule_id: String(slot.zone_schedule_id),
    purpose: String(appointment.purpose),
    declaration_number: String(appointment.declaration_number),
    fleet_info: appointment.fleet_info,
    cargo_type: appointment.cargo_type || '',
    bayan_appointment: appointment.bayan_appointment || {},
    token: String(token).replace(/^Bearer\s+/i, ''),
    userType: appointment.userType || userType || 'broker'
  };
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
 * @param {object[]} [options.schedules] — or pass landScheduleData
 * @param {object} [options.landScheduleData] — raw FASAH getLandSchedule body
 * @param {string} options.fasahToken — FASAH JWT
 * @param {string} [options.userType]
 * @param {function} [options.onProgress] — ({ index, total, appointmentId, phase, result? })
 */
async function runAutoTransitBookForUser(userId, options = {}) {
  const uid = String(userId);
  const fasahToken = options.fasahToken || options.token;
  if (!fasahToken) {
    return { ok: false, status: 400, message: 'FASAH token required (fasahToken)' };
  }

  const { schedules, headerMsg } = options.schedules
    ? { schedules: options.schedules, headerMsg: options.headerMsg || '' }
    : extractLandSchedules(options.landScheduleData);

  if (!schedules.length) {
    return { ok: false, status: 400, message: 'No schedules available to book' };
  }

  const stored = await loadAppointmentsForUser(uid);
  const pending = (stored.appointments || []).filter(isPendingAppointment);

  if (!pending.length) {
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
    Math.min(
      pending.length,
      options.concurrency || proxies.length || 1
    )
  );

  const mongoUser = await User.findById(uid).select('_id email');
  const proxyContext = mongoUser || { _id: uid };

  const booked = [];
  const failed = [];
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
            index: taskIndex,
            total,
            appointmentId,
            phase: 'matching'
          });
        }

        if (!appointment.declaration_number || !appointment.purpose || !appointment.fleet_info) {
          return {
            appointmentId,
            ok: false,
            skipped: true,
            message: 'Missing declaration_number, purpose, or fleet_info on stored appointment'
          };
        }

        const slot = pickSlotForAppointment(schedules, appointment);
        if (!slot) {
          return {
            appointmentId,
            ok: false,
            skipped: true,
            message: 'No matching bookable slot in schedules'
          };
        }

        const body = buildBookingBody(appointment, slot, fasahToken, options.userType);

        if (options.onProgress) {
          options.onProgress({
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
            proxyIndex
          };
        } catch (err) {
          return {
            appointmentId,
            ok: false,
            result: {
              success: false,
              message: err.message || String(err),
              httpStatus: err.status || 500
            },
            slot,
            proxyIndex
          };
        }
      })
    );

    for (const item of waveResults) {
      const key = item.appointmentId;
      const prev = updatedById.get(key) || {};

      if (item.skipped) {
        skipped.push({ appointmentId: key, message: item.message });
        updatedById.set(key, {
          ...prev,
          ...item,
          status: 'pending',
          lastError: item.message,
          updatedAt: new Date().toISOString()
        });
        continue;
      }

      if (item.ok && item.result?.success) {
        booked.push({
          appointmentId: key,
          tasBookRef: item.result.tasBookRef,
          zone_schedule_id: item.slot?.zone_schedule_id,
          schedule_from: item.slot?.schedule_from,
          proxyIndex: item.proxyIndex
        });
        updatedById.set(key, {
          ...prev,
          status: 'booked',
          tasBookRef: item.result.tasBookRef,
          zone_schedule_id: item.slot?.zone_schedule_id,
          schedule_from: item.slot?.schedule_from,
          schedule_to: item.slot?.schedule_to,
          bookedAt: new Date().toISOString(),
          lastError: null
        });
      } else {
        failed.push({
          appointmentId: key,
          message: item.result?.message || 'Booking failed',
          proxyIndex: item.proxyIndex
        });
        updatedById.set(key, {
          ...prev,
          status: 'failed',
          lastError: item.result?.message || 'Booking failed',
          updatedAt: new Date().toISOString()
        });
      }

      if (options.onProgress) {
        options.onProgress({
          index: taskIndex,
          total,
          appointmentId: key,
          phase: 'done',
          success: Boolean(item.ok && item.result?.success)
        });
      }
    }
  }

  const appointments = Array.from(updatedById.values());
  await persistAppointments(uid, appointments, mongoUser?.email || stored.email);

  return {
    ok: true,
    schedules,
    headerMsg,
    concurrency,
    proxyCount: proxies.length,
    booked,
    failed,
    skipped,
    appointments
  };
}

module.exports = {
  runAutoTransitBookForUser,
  isPendingAppointment,
  buildBookingBody
};
