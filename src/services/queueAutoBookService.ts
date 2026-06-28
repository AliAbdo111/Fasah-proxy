// @ts-nocheck
/* Ported from services/queueAutoBookService.js */
import QueueAppointment from '../schemas/queue-appointment.schema';
import FasahClient from './fasahClient';
import {
  QUEUE_STATUS,
  hasBookingPayload,
  buildTransitCreateBody,
  applyBookedState,
  applyBookingAttemptFailure,
  resolveBearer,
  needsBooking,
  getBookingAttempts,
  MAX_BOOKING_ATTEMPTS
} from './queueAppointmentShape';
import { listSlotsToTry } from './landScheduleExtract';
import { executeTransitBooking } from './transitBookingCore';
import { loadUnavailableIds, markSlotUnavailable, todaySessionId } from './unavailableSlotsStore';
import { loadAllNeedingBooking } from './queueWatcherService';

async function persistAppointmentRecord(doc, patch) {
  const filter = { userId: doc.userId, id: doc.id };
  const $set = { ...patch, updatedAt: new Date() };
  await QueueAppointment.findOneAndUpdate(filter, { $set }, { returnDocument: 'after' });
}

async function reloadAppointment(doc) {
  return QueueAppointment.findOne({ userId: doc.userId, id: doc.id }).lean();
}

function isRetryableSlotError(message) {
  const msg = String(message || '').toLowerCase();
  return msg.includes('schedule_not_exist') || msg.includes('zero_available');
}

async function tryBookOnce({
  appointment,
  schedules,
  unavailableIds,
  sessionId,
  proxyIndex,
  fasahToken,
  endpoint
}) {
  const slotsToTry = listSlotsToTry(schedules, appointment, unavailableIds);
  if (!slotsToTry.length) {
    return {
      ok: false,
      message: 'No bookable slots in current schedules',
      result: null,
      slot: null,
      unavailableIds
    };
  }

  let lastResult = null;
  let lastSlot = null;
  let lastMessage = 'Booking failed';

  for (let i = 0; i < slotsToTry.length; i++) {
    const slot = slotsToTry[i];
    const body = buildTransitCreateBody(appointment, slot, fasahToken);
    const result = await executeTransitBooking({
      mongoUserId: String(appointment.userId),
      appointmentId: appointment.id,
      body,
      proxyIndex,
      endpoint: i === 0 ? endpoint || '/watcher/auto-book' : '/watcher/auto-book-retry'
    });

    lastResult = result;
    lastSlot = slot;
    lastMessage = result?.message || lastMessage;

    if (result.success) {
      return { ok: true, result, slot, unavailableIds, message: result.message };
    }

    if (result.zeroAvailableSlots || isRetryableSlotError(result.message)) {
      await markSlotUnavailable({
        zone_schedule_id: slot.zone_schedule_id,
        port_code: slot.port_code || slot.zone_code,
        sessionId,
        reason: result.message || 'slot_unavailable'
      });
      unavailableIds = await loadUnavailableIds(sessionId);
      continue;
    }

    break;
  }

  return {
    ok: false,
    result: lastResult,
    slot: lastSlot,
    unavailableIds,
    message: lastMessage
  };
}

async function recordBookingFailure(current, message) {
  const prev = (await reloadAppointment(current)) || current;
  const { record, isFinalFailure, attempts } = applyBookingAttemptFailure(prev, message);
  await persistAppointmentRecord(prev, record);
  return { record, isFinalFailure, attempts, prev };
}

async function bookAppointmentWithRetries({
  appointment,
  schedules,
  sessionId,
  proxyIndex,
  onProgress
}) {
  const appointmentId = appointment.id;
  const userId = String(appointment.userId);
  let unavailableIds = await loadUnavailableIds(sessionId);
  let current = appointment;
  let attemptProxy = proxyIndex;

  if (!needsBooking(current)) {
    return { appointmentId, skipped: true, message: 'Already resolved or max attempts reached' };
  }

  if (!hasBookingPayload(current)) {
    return {
      appointmentId,
      skipped: true,
      message: 'Missing declaration_number, purpose, or fleet_info'
    };
  }

  if (onProgress) {
    onProgress({ phase: 'booking', appointmentId, userId, proxyIndex: attemptProxy });
  }

  while (true) {
    current = (await reloadAppointment(current)) || current;
    if (!needsBooking(current)) {
      break;
    }

    const attemptNum = getBookingAttempts(current) + 1;
    const fasahToken = resolveBearer(current);

    try {
      const tryResult = await tryBookOnce({
        appointment: current,
        schedules,
        unavailableIds,
        sessionId,
        proxyIndex: attemptProxy,
        fasahToken,
        endpoint: attemptNum > 1 ? '/watcher/auto-book-retry' : '/watcher/auto-book'
      });
      unavailableIds = tryResult.unavailableIds || unavailableIds;

      if (tryResult.ok) {
        return {
          appointmentId,
          userId,
          ok: true,
          result: tryResult.result,
          slot: tryResult.slot,
          sourceAppointment: current,
          attempts: attemptNum
        };
      }

      const message = tryResult.result?.message || tryResult.message || 'Booking failed';
      const { isFinalFailure, attempts } = await recordBookingFailure(current, message);
      current = (await reloadAppointment(current)) || current;

      if (onProgress) {
        onProgress({
          phase: isFinalFailure ? 'failed' : 'retry',
          appointmentId,
          userId,
          message,
          attempts,
          maxAttempts: MAX_BOOKING_ATTEMPTS
        });
      }

      console.log(
        `[watcher] book attempt ${attempts}/${MAX_BOOKING_ATTEMPTS} failed appointment=${appointmentId} msg=${message}`
      );

      if (isFinalFailure) {
        return {
          appointmentId,
          userId,
          ok: false,
          result: tryResult.result,
          message,
          attempts,
          final: true,
          sourceAppointment: current
        };
      }
    } catch (err) {
      const message = err?.message || String(err);
      const { isFinalFailure, attempts } = await recordBookingFailure(current, message);
      current = (await reloadAppointment(current)) || current;

      console.log(
        `[watcher] book attempt ${attempts}/${MAX_BOOKING_ATTEMPTS} error appointment=${appointmentId} msg=${message}`
      );

      if (onProgress) {
        onProgress({
          phase: isFinalFailure ? 'failed' : 'retry',
          appointmentId,
          userId,
          message,
          attempts,
          maxAttempts: MAX_BOOKING_ATTEMPTS
        });
      }

      if (isFinalFailure) {
        return {
          appointmentId,
          userId,
          ok: false,
          message,
          attempts,
          final: true,
          sourceAppointment: current
        };
      }
    }

    const proxyCount = FasahClient.getPlatformProxyCount() || 1;
    attemptProxy = (attemptProxy + 1) % proxyCount;
  }

  const finalDoc = (await reloadAppointment(current)) || current;
  const attempts = getBookingAttempts(finalDoc);
  const isFinal = attempts >= MAX_BOOKING_ATTEMPTS || String(finalDoc.status) === QUEUE_STATUS.FAILED;

  return {
    appointmentId,
    userId,
    ok: false,
    message: finalDoc.lastError || 'Max booking attempts reached',
    attempts,
    final: isFinal,
    sourceAppointment: finalDoc
  };
}

/**
 * Auto-book all in_queue rows after schedules are found.
 * Each appointment retries until success or MAX_BOOKING_ATTEMPTS (status → failed only at the end).
 */
async function runAutoBookForAll({ schedules, sessionId, onProgress } = {}) {
  const sid = sessionId || todaySessionId();
  const pending = await loadAllNeedingBooking();

  if (!pending.length) {
    return { booked: [], failed: [], skipped: [], total: 0 };
  }

  const proxyCount = FasahClient.getPlatformProxyCount() || 1;
  const concurrency = Math.max(1, proxyCount);
  const booked = [];
  const failed = [];
  const skipped = [];

  for (let waveStart = 0; waveStart < pending.length; waveStart += concurrency) {
    const wave = pending.slice(waveStart, waveStart + concurrency);

    const waveResults = await Promise.all(
      wave.map(async (appointment, waveOffset) => {
        const proxyIndex = (waveStart + waveOffset) % concurrency;
        return bookAppointmentWithRetries({
          appointment,
          schedules,
          sessionId: sid,
          proxyIndex,
          onProgress
        });
      })
    );

    for (const item of waveResults) {
      if (item.skipped) {
        skipped.push({ appointmentId: item.appointmentId, message: item.message });
        continue;
      }

      const prev = item.sourceAppointment;
      if (item.ok) {
        const record = applyBookedState(prev, {
          slot: item.slot,
          tasBookRef: item.result.tasBookRef
        });
        await persistAppointmentRecord(prev, record);
        booked.push({ appointmentId: item.appointmentId, tasBookRef: item.result.tasBookRef });
        if (onProgress) {
          onProgress({
            phase: 'booked',
            appointmentId: item.appointmentId,
            userId: item.userId,
            tasBookRef: item.result.tasBookRef
          });
        }
      } else {
        const entry = {
          appointmentId: item.appointmentId,
          userId: item.userId,
          message: item.message || item.result?.message || 'Booking failed',
          attempts: item.attempts,
          final: Boolean(item.final)
        };
        failed.push(item.final ? entry : { ...entry, retrying: true });
      }
    }
  }

  return {
    booked,
    failed,
    skipped,
    total: pending.length
  };
}

export { runAutoBookForAll };
export { persistAppointmentRecord };
