// @ts-nocheck
/* Ported from services/appointmentWatcherCron.js */
import WatcherRun from '../schemas/watcher-run.schema';
import { pollAllUsersOnce } from './queueWatcherService';
import { runAutoBookForAll } from './queueAutoBookService';
import { todaySessionId } from './unavailableSlotsStore';

const TZ = process.env.WATCHER_CRON_TZ || 'Africa/Cairo';
const POLL_MS = Math.max(1000, Number(process.env.WATCHER_POLL_INTERVAL_MS) || 3000);
const ENABLED = String(process.env.WATCHER_ENABLED || 'false').toLowerCase() === 'true';
const IGNORE_WINDOW = String(process.env.WATCHER_IGNORE_WINDOW || 'false').toLowerCase() === 'true';
const KEEP_POLLING = String(process.env.WATCHER_KEEP_POLLING || 'true').toLowerCase() === 'true';

let watcherActive = false;
let nextTickTimer: ReturnType<typeof setTimeout> | null = null;
let tickInFlight = false;
let pollTickCounter = 0;
let currentRun: any = null;

function getCairoTimeParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
  const parts = fmt.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  return { hour, minute };
}

function isInWatcherWindow(date = new Date()) {
  if (IGNORE_WINDOW) return true;
  const { hour, minute } = getCairoTimeParts(date);
  if (hour === 13 && minute >= 55) return true;
  if (hour === 14 && minute <= 30) return true;
  return false;
}

async function upsertWatcherRun(patch) {
  const sessionId = todaySessionId();
  const doc = await WatcherRun.findOneAndUpdate(
    { sessionId },
    { $set: { sessionId, ...patch } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  currentRun = doc;
  return doc;
}

async function getWatcherStatus() {
  const sessionId = todaySessionId();
  const latest =
    currentRun ||
    (await WatcherRun.findOne({ sessionId }).sort({ updatedAt: -1 }).lean()) ||
    (await WatcherRun.findOne().sort({ updatedAt: -1 }).lean());

  return {
    enabled: ENABLED,
    ignoreWindow: IGNORE_WINDOW,
    keepPolling: KEEP_POLLING,
    timezone: TZ,
    pollIntervalMs: POLL_MS,
    inWindow: isInWatcherWindow(),
    watcherActive,
    pollTickCounter,
    sessionId,
    run: latest
      ? {
          phase: latest.phase,
          sessionId: latest.sessionId,
          startedAt: latest.startedAt,
          stoppedAt: latest.stoppedAt,
          slotsFound: latest.slotsFound,
          usersChecked: latest.usersChecked,
          appointmentsBooked: latest.appointmentsBooked,
          appointmentsFailed: latest.appointmentsFailed,
          pollTicks: latest.pollTicks,
          lastError: latest.lastError,
          meta: latest.meta,
          updatedAt: latest.updatedAt
        }
      : { phase: 'idle' }
  };
}

function stopWatcherLoop(reason) {
  watcherActive = false;
  if (nextTickTimer) {
    clearTimeout(nextTickTimer);
    nextTickTimer = null;
  }
  console.log(`[watcher] loop stopped: ${reason}`);
}

function scheduleNextTick(delayMs = POLL_MS) {
  if (!watcherActive) return;
  if (nextTickTimer) clearTimeout(nextTickTimer);
  nextTickTimer = setTimeout(() => {
    runWatcherTick()
      .catch((err) => console.error('[watcher] unhandled', err))
      .finally(() => {
        if (watcherActive) scheduleNextTick(POLL_MS);
      });
  }, delayMs);
  console.log(`[watcher] next poll in ${delayMs}ms`);
}

async function runWatcherTick() {
  if (tickInFlight) {
    console.log('[watcher] previous tick still running — skip overlap');
    return;
  }

  if (!isInWatcherWindow()) {
    const { hour, minute } = getCairoTimeParts();
    console.log(
      `[watcher] outside window (${hour}:${String(minute).padStart(2, '0')} ${TZ}) — waiting (set WATCHER_IGNORE_WINDOW=true to test anytime)`
    );
    if (currentRun?.phase === 'polling') {
      await upsertWatcherRun({
        phase: 'done',
        stoppedAt: new Date(),
        meta: { reason: 'window_ended' }
      });
      stopWatcherLoop('window_ended');
    }
    return;
  }

  tickInFlight = true;
  const sessionId = todaySessionId();
  const tickIndex = pollTickCounter;

  try {
    if (!currentRun || currentRun.phase === 'idle' || currentRun.phase === 'done') {
      await upsertWatcherRun({
        phase: 'polling',
        startedAt: new Date(),
        stoppedAt: undefined,
        slotsFound: false,
        pollTicks: 0,
        lastError: undefined
      });
    }

    const poll = await pollAllUsersOnce({ sessionId, tickIndex });
    pollTickCounter += 1;
    const ticks = pollTickCounter;

    await upsertWatcherRun({
      phase: 'polling',
      usersChecked: poll.usersChecked,
      pollTicks: ticks,
      meta: {
        tickIndex,
        queueUsers: poll.users,
        lastPoll: poll.results?.map((r) => ({
          userId: r.userId,
          ok: r.ok,
          scheduleCount: r.scheduleCount,
          bookableCount: r.bookableCount,
          message: r.message,
          headerMsg: r.headerMsg,
          proxyIndex: r.proxyIndex,
          proxy: r.proxyLabel
        }))
      }
    });

    const queueSummary = poll.users?.map((u) => `${u.appointmentCount} appt`).join(', ') || '';
    console.log(
      `[watcher] poll tick ${ticks} users=${poll.usersChecked} found=${poll.found} schedules=${poll.schedules?.length || 0}` +
        (queueSummary ? ` queue=[${queueSummary}]` : '')
    );

    if (!poll.found && poll.results?.length) {
      for (const r of poll.results) {
        console.log(
          `[watcher] poll user=${r.userId} schedules=${r.scheduleCount || 0} bookable=${r.bookableCount || 0}` +
            ` msg=${r.message || r.headerMsg || 'no slots'}`
        );
      }
    }

    if (poll.found && poll.schedules?.length) {
      if (!KEEP_POLLING) stopWatcherLoop('slots_found');
      await upsertWatcherRun({
        phase: 'booking',
        slotsFound: true,
        usersChecked: poll.usersChecked,
        pollTicks: ticks
      });

      const summary = await runAutoBookForAll({
        schedules: poll.schedules,
        sessionId,
        onProgress: (p) => console.log('[watcher] book progress', p)
      });

      await upsertWatcherRun({
        phase: KEEP_POLLING ? 'polling' : 'done',
        stoppedAt: KEEP_POLLING ? undefined : new Date(),
        slotsFound: true,
        usersChecked: poll.usersChecked,
        appointmentsBooked: summary.booked.length,
        appointmentsFailed: summary.failed.filter((f) => f.final).length,
        pollTicks: ticks,
        meta: { summary, queueUsers: poll.users }
      });

      console.log('[watcher] auto-book done', summary);
      if (!KEEP_POLLING) return;
    }

    const { hour, minute } = getCairoTimeParts();
    if (!IGNORE_WINDOW && !KEEP_POLLING && hour === 14 && minute >= 30) {
      stopWatcherLoop('window_end_14_30');
      await upsertWatcherRun({
        phase: 'done',
        stoppedAt: new Date(),
        slotsFound: false,
        meta: { reason: 'no_slots_in_window' }
      });
    }
  } catch (err) {
    console.error('[watcher] tick error', err.message || err);
    await upsertWatcherRun({
      phase: KEEP_POLLING ? 'polling' : 'error',
      lastError: err.message || String(err),
      stoppedAt: KEEP_POLLING ? undefined : new Date()
    });
  } finally {
    tickInFlight = false;
  }
}

function startAppointmentWatcherCron() {
  if (!ENABLED) {
    console.log('[watcher] WATCHER_ENABLED=false — cron not started');
    return;
  }

  if (watcherActive) {
    console.log('[watcher] already running');
    return;
  }

  watcherActive = true;
  pollTickCounter = 0;

  console.log(
    `[watcher] started — window 13:55–14:30 ${TZ}, ${POLL_MS}ms after each poll completes` +
      (IGNORE_WINDOW ? ' (WATCHER_IGNORE_WINDOW=true)' : '') +
      (KEEP_POLLING ? ' (WATCHER_KEEP_POLLING=true)' : '')
  );

  runWatcherTick()
    .catch((err) => console.error('[watcher] initial tick', err))
    .finally(() => scheduleNextTick(POLL_MS));
}

function stopAppointmentWatcherCron() {
  stopWatcherLoop('manual');
}

export { startAppointmentWatcherCron };
export { stopAppointmentWatcherCron };
export { getWatcherStatus };
export { isInWatcherWindow };
export { runWatcherTick };
