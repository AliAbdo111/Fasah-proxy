// @ts-nocheck
/* Ported from services/queueAutoBookService.js */
import mongoose from 'mongoose';
import QueueAppointment from '../schemas/queue-appointment.schema';
import FasahClient from './fasahClient';
import {
  QUEUE_STATUS,
  hasBookingPayload,
  buildTransitCreateBody,
  applyBookedState,
  applyBookingAttemptFailure,
  resolveBearer,
  watcherNeedsBooking
} from './queueAppointmentShape';
import {
  pickSlotForAppointment,
  pickRandomBookableSlot
} from './landScheduleExtract';
import { executeTransitBooking } from './transitBookingCore';
import { loadUnavailableIds, markSlotUnavailable, todaySessionId } from './unavailableSlotsStore';
import { loadAllNeedingBooking } from './queueWatcherService';

async function persistAppointmentRecord(doc, patch) {
  const filter = { userId: doc.userId, id: doc.id };
  const $set = { ...patch, updatedAt: new Date() };
  await QueueAppointment.findOneAndUpdate(filter, { $set }, { new: true });
}

async function setAppointmentPending(doc) {
  const patch = { status: QUEUE_STATUS.PENDING, lastError: undefined };
  if (String(doc.status || '').toLowerCase() === QUEUE_STATUS.FAILED) {
    patch.bookingAttempts = 0;
  }
  await persistAppointmentRecord(doc, patch);
}

/**
 * Auto-book all in_queue / retryable pending rows after schedules are found.
 */
async function runAutoBookForAll({ schedules, sessionId, onProgress } = {}) {
  const sid = sessionId || todaySessionId();
  let unavailableIds = await loadUnavailableIds(sid);
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
        const appointmentId = appointment.id;
        const userId = String(appointment.userId);

        if (!watcherNeedsBooking(appointment)) {
          return { appointmentId, skipped: true, message: 'Already resolved' };
        }

        if (!hasBookingPayload(appointment)) {
          return {
            appointmentId,
            skipped: true,
            message: 'Missing declaration_number, purpose, or fleet_info'
          };
        }

        await setAppointmentPending(appointment);

        if (onProgress) {
          onProgress({ phase: 'booking', appointmentId, userId, proxyIndex });
        }

        let slot = pickSlotForAppointment(schedules, appointment, unavailableIds);
        if (!slot) {
          return {
            appointmentId,
            userId,
            ok: false,
            message: 'No matching bookable slot in schedules',
            sourceAppointment: appointment
          };
        }

        const fasahToken = resolveBearer(appointment);
        let body = buildTransitCreateBody(appointment, slot, fasahToken);
        let result = await executeTransitBooking({
          mongoUserId: userId,
          appointmentId,
          body,
          proxyIndex,
          endpoint: '/watcher/auto-book'
        });

        if (!result.success && result.zeroAvailableSlots) {
          const randomSlot = pickRandomBookableSlot(schedules, unavailableIds);
          if (randomSlot) {
            await markSlotUnavailable({
              zone_schedule_id: randomSlot.zone_schedule_id,
              port_code: randomSlot.port_code || randomSlot.zone_code,
              sessionId: sid,
              reason: 'zero_available_slots'
            });
            unavailableIds = await loadUnavailableIds(sid);
            slot = randomSlot;
            body = buildTransitCreateBody(appointment, slot, fasahToken);
            result = await executeTransitBooking({
              mongoUserId: userId,
              appointmentId,
              body,
              proxyIndex,
              endpoint: '/watcher/auto-book-retry'
            });
          }
        }

        return {
          appointmentId,
          userId,
          ok: result.success,
          result,
          slot,
          sourceAppointment: appointment
        };
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
        const message = item.result?.message || item.message || 'Booking failed';
        const { record, isFinalFailure, attempts } = applyBookingAttemptFailure(prev, message);
        await persistAppointmentRecord(prev, record);
        const entry = {
          appointmentId: item.appointmentId,
          userId: item.userId,
          message,
          attempts,
          final: isFinalFailure
        };
        if (isFinalFailure) failed.push(entry);
        else failed.push({ ...entry, retrying: true });
        if (onProgress) {
          onProgress({
            phase: isFinalFailure ? 'failed' : 'retry',
            appointmentId: item.appointmentId,
            userId: item.userId,
            message,
            attempts
          });
        }
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
