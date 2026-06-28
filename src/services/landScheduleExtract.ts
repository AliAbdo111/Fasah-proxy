// @ts-nocheck
/* Ported from services/landScheduleExtract.js */
/**
 * Normalize FASAH land schedule API responses → { schedules, headerMsg }.
 */

import { getPreferredScheduleIndex, getPreferredZoneScheduleId } from './queueAppointmentShape';

function normalizeScheduleTime(value) {
  if (!value) return '';
  const s = String(value).trim().replace('T', ' ');
  const match = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})/);
  if (match) return `${match[1]} ${match[2]}:${match[3]}`;
  return s.slice(0, 16);
}

function isFasahScheduleId(value) {
  return /^\d{10,}$/.test(String(value || '').trim());
}

function getStoredSlotHints(appointment) {
  const selected = appointment?.appointment?.selectedSlot || {};
  const submit = appointment?.submitData || {};
  return {
    scheduleFrom: normalizeScheduleTime(selected.schedule_from || submit.schedule_from),
    scheduleTo: normalizeScheduleTime(selected.schedule_to || submit.schedule_to),
    portCode: String(
      selected.port_code || selected.zone_code || submit.port_code || ''
    ).trim()
  };
}

function slotMatchesHints(slot, hints) {
  if (!hints?.scheduleFrom) return true;
  return normalizeScheduleTime(slot?.schedule_from) === hints.scheduleFrom;
}

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

/** Preferred slot only — no fallback. */
function pickPreferredSlotForAppointment(schedules, appointment, unavailableIds = new Set()) {
  const rawList = Array.isArray(schedules) ? schedules : [];
  const hints = getStoredSlotHints(appointment);
  const preferredId = getPreferredZoneScheduleId(appointment);

  const isAvailable = (slot) =>
    slot &&
    isBookableSlot(slot) &&
    !unavailableIds.has(String(slot.zone_schedule_id));

  if (preferredId && isFasahScheduleId(preferredId)) {
    const byId = rawList.find((slot) => String(slot.zone_schedule_id) === String(preferredId));
    if (isAvailable(byId)) return byId;
  }

  if (hints.scheduleFrom) {
    const byTime = rawList.find(
      (slot) =>
        isAvailable(slot) &&
        slotMatchesHints(slot, hints) &&
        (!hints.portCode ||
          String(slot.port_code || slot.zone_code) === hints.portCode)
    );
    if (byTime) return byTime;
  }

  const preferredIndex = getPreferredScheduleIndex(appointment);
  if (preferredIndex != null && preferredIndex < rawList.length) {
    const slot = rawList[preferredIndex];
    if (isAvailable(slot) && slotMatchesHints(slot, hints)) {
      return slot;
    }
  }

  return null;
}

/** First bookable slot in API order (deterministic, not random). */
function pickFirstBookableSlot(schedules, unavailableIds = new Set()) {
  const list = filterBookableSchedules(schedules, unavailableIds);
  return list[0] || null;
}

/**
 * Pick slot: preferred match first, then any bookable slot from current poll.
 * Goal is to book — not to fail when the saved day/time is not in today's list.
 */
function pickSlotForAppointment(schedules, appointment, unavailableIds = new Set()) {
  return (
    pickPreferredSlotForAppointment(schedules, appointment, unavailableIds) ||
    pickFirstBookableSlot(schedules, unavailableIds)
  );
}

/** Ordered list of slots to try: preferred first, then remaining bookable slots. */
function listSlotsToTry(schedules, appointment, unavailableIds = new Set()) {
  const preferred = pickPreferredSlotForAppointment(schedules, appointment, unavailableIds);
  const bookable = filterBookableSchedules(schedules, unavailableIds);
  const seen = new Set();
  const ordered = [];

  if (preferred) {
    ordered.push(preferred);
    seen.add(String(preferred.zone_schedule_id));
  }

  for (const slot of bookable) {
    const id = String(slot.zone_schedule_id);
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(slot);
  }

  return ordered;
}

function pickRandomBookableSlot(schedules, unavailableIds = new Set()) {
  return pickFirstBookableSlot(schedules, unavailableIds);
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
export { pickPreferredSlotForAppointment };
export { pickFirstBookableSlot };
export { listSlotsToTry };
export { pickRandomBookableSlot };
export { extractBookableZoneScheduleIds };
export { hasBookableSchedules };
