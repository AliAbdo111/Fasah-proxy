// @ts-nocheck
/* Ported from services/landScheduleExtract.js */
/**
 * Normalize FASAH land schedule API responses → { schedules, headerMsg }.
 */

import { getPreferredScheduleIndex } from './queueAppointmentShape';

function extractLandSchedules(data) {
  if (!data || typeof data !== 'object') {
    return { schedules: [], headerMsg: '' };
  }
  const candidates = [
    data.schedules,
    data.data?.schedules,
    data.result?.schedules,
    data.data?.data?.schedules,
    data.data?.result?.schedules
  ];
  const schedules = candidates.find((list) => Array.isArray(list) && list.length > 0) || [];
  const headerMsg =
    data.headerMsg ??
    data.data?.headerMsg ??
    data.result?.headerMsg ??
    data.data?.data?.headerMsg ??
    '';

  return { schedules, headerMsg };
}

function isBookableSlot(slot) {
  if (!slot || typeof slot !== 'object') return false;
  if (slot.can_book === false) return false;
  if (String(slot.is_active || '').toUpperCase() === 'N') return false;
  const available = Number(slot.available_slot);
  if (Number.isFinite(available) && available <= 0) return false;
  const status = String(slot.slot_status || '').toLowerCase();
  if (status && status !== 'available') return false;
  return Boolean(slot.zone_schedule_id);
}

function filterBookableSchedules(schedules, unavailableIds = new Set()) {
  const list = Array.isArray(schedules) ? schedules : [];
  return list.filter((slot) => {
    if (!isBookableSlot(slot)) return false;
    const id = String(slot.zone_schedule_id);
    return !unavailableIds.has(id);
  });
}

/** Pick slot by stored zone_schedule_id index into the API schedules list. */
function pickSlotForAppointment(schedules, appointment, unavailableIds = new Set()) {
  const rawList = Array.isArray(schedules) ? schedules : [];
  const preferredIndex = getPreferredScheduleIndex(appointment);

  if (preferredIndex != null && preferredIndex < rawList.length) {
    const slot = rawList[preferredIndex];
    if (
      slot &&
      isBookableSlot(slot) &&
      !unavailableIds.has(String(slot.zone_schedule_id))
    ) {
      return slot;
    }
  }

  const list = filterBookableSchedules(schedules, unavailableIds);
  return list[0] || null;
}

function pickRandomBookableSlot(schedules, unavailableIds = new Set()) {
  const list = filterBookableSchedules(schedules, unavailableIds);
  if (!list.length) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

function extractBookableZoneScheduleIds(data, unavailableIds = new Set()) {
  const { schedules } = extractLandSchedules(data);
  const ids = [];
  const seen = new Set();
  for (const slot of filterBookableSchedules(schedules, unavailableIds)) {
    const id = String(slot.zone_schedule_id);
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function hasBookableSchedules(data, unavailableIds = new Set()) {
  const { schedules } = extractLandSchedules(data);
  return filterBookableSchedules(schedules, unavailableIds).length > 0;
}

export { extractLandSchedules };
export { isBookableSlot };
export { filterBookableSchedules };
export { pickSlotForAppointment };
export { pickRandomBookableSlot };
export { extractBookableZoneScheduleIds };
export { hasBookableSchedules };
