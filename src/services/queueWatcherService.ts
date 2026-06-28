// @ts-nocheck
/* Ported from services/queueWatcherService.js */
import FasahClient from './fasahClient';
import QueueAppointment from '../schemas/queue-appointment.schema';
import {
  assertMongoReady,
  buildScheduleCheckProfile,
  needsBooking,
  WATCHER_QUEUE_STATUSES
} from './queueAppointmentShape';
import { extractLandSchedules, filterBookableSchedules } from './landScheduleExtract';
import { loadUnavailableIds, todaySessionId } from './unavailableSlotsStore';

const fasahClient = FasahClient.getInstance();

const ACTIVE_STATUSES = WATCHER_QUEUE_STATUSES;
const POLL_REQUEST_TIMEOUT_MS = Math.min(
  60000,
  Math.max(3000, Number(process.env.WATCHER_REQUEST_TIMEOUT_MS) || 15000)
);

async function fetchLandScheduleForPoll(params) {
  let timer;
  const upstream = fasahClient.getLandSchedule(params);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`schedule poll timeout after ${POLL_REQUEST_TIMEOUT_MS}ms`)),
      POLL_REQUEST_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([upstream, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function proxyLabel(proxyIndex) {
  const proxy = fasahClient.getPlatformProxyAt(proxyIndex);
  return proxy ? `${proxy.host}:${proxy.port}` : 'direct';
}

async function listUsersWithQueue() {
  assertMongoReady();
  const rows = await QueueAppointment.aggregate([
    { $match: { status: { $in: ACTIVE_STATUSES } } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$userId',
        firstAppointmentId: { $first: '$id' },
        count: { $sum: 1 }
      }
    }
  ]);
  return rows.map((r) => ({
    userId: String(r._id),
    firstAppointmentId: r.firstAppointmentId,
    count: r.count
  }));
}

async function getFirstAppointmentForUser(userId) {
  assertMongoReady();
  const docs = await QueueAppointment.find({
    userId,
    status: { $in: ACTIVE_STATUSES }
  })
    .sort({ createdAt: 1 })
    .lean();
  return docs.find(needsBooking) || null;
}

async function loadAllNeedingBooking() {
  assertMongoReady();
  const docs = await QueueAppointment.find({ status: { $in: ACTIVE_STATUSES } })
    .sort({ createdAt: 1 })
    .lean();
  return docs.filter(needsBooking);
}

/**
 * One FASAH schedule check per user — token from earliest queued appointment (createdAt ASC).
 */
async function pollAllUsersOnce({ sessionId, tickIndex = 0 } = {}) {
  assertMongoReady();
  const unavailableIds = await loadUnavailableIds(sessionId || todaySessionId());
  const users = await listUsersWithQueue();
  const proxyCount = FasahClient.getPlatformProxyCount() || 1;

  if (!users.length) {
    return { found: false, usersChecked: 0, schedules: [], results: [], reason: 'no_users_in_queue' };
  }

  const results = await Promise.all(
    users.map(async (u, userIndex) => {
      const proxyIndex = (tickIndex * users.length + userIndex) % proxyCount;
      const first = await getFirstAppointmentForUser(u.userId);
      if (!first || !needsBooking(first)) {
        return { userId: u.userId, ok: false, message: 'No bookable first appointment', proxyIndex };
      }

      const profile = buildScheduleCheckProfile(first);
      if (!profile.token || !profile.arrival) {
        return {
          userId: u.userId,
          appointmentId: first.id,
          ok: false,
          message: 'Missing token or port_code on first appointment',
          proxyIndex
        };
      }

      try {
        const raw = await fetchLandScheduleForPoll({
          departure: profile.departure,
          arrival: profile.arrival,
          type: profile.type,
          token: profile.token.replace(/^Bearer\s+/i, ''),
          userType: profile.userType,
          proxyIndex
        });
        const { schedules, headerMsg } = extractLandSchedules(raw);
        const bookableSchedules = filterBookableSchedules(schedules, unavailableIds);
        const bookable = bookableSchedules.length > 0;
        return {
          userId: u.userId,
          appointmentId: first.id,
          ok: bookable,
          schedules,
          scheduleCount: schedules.length,
          bookableCount: bookableSchedules.length,
          headerMsg,
          raw,
          proxyIndex,
          proxyLabel: proxyLabel(proxyIndex),
          profile: {
            departure: profile.departure,
            arrival: profile.arrival,
            type: profile.type,
            userType: profile.userType
          }
        };
      } catch (err) {
        return {
          userId: u.userId,
          appointmentId: first.id,
          ok: false,
          message: err.message || String(err),
          proxyIndex,
          proxyLabel: proxyLabel(proxyIndex)
        };
      }
    })
  );

  const merged = [];
  const seen = new Set();
  let found = false;

  for (const r of results) {
    if (!Array.isArray(r.schedules) || !r.schedules.length) continue;
    if (r.ok) found = true;
    for (const slot of r.schedules) {
      const id = String(slot.zone_schedule_id);
      if (seen.has(id)) continue;
      seen.add(id);
      merged.push(slot);
    }
  }

  return {
    found,
    usersChecked: users.length,
    schedules: merged,
    results,
    users: users.map((u) => ({ userId: u.userId, appointmentCount: u.count }))
  };
}

export { listUsersWithQueue };
export { getFirstAppointmentForUser };
export { loadAllNeedingBooking };
export { pollAllUsersOnce };
