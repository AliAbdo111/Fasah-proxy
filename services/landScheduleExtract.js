/**
 * Normalize FASAH land schedule API responses → { schedules, headerMsg }.
 */

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

const { getPreferredZoneScheduleId } = require('./appointmentBookingShape');

/** Pick slot for one stored appointment (preferred zone_schedule_id or first bookable). */
function pickSlotForAppointment(schedules, appointment) {
  const list = Array.isArray(schedules) ? schedules : [];
  const preferredId = getPreferredZoneScheduleId(appointment);

  if (preferredId) {
    const match = list.find(
      (s) => String(s.zone_schedule_id) === preferredId && isBookableSlot(s)
    );
    if (match) return match;
  }

  return list.find((s) => isBookableSlot(s)) || null;
}

module.exports = {
  extractLandSchedules,
  isBookableSlot,
  pickSlotForAppointment
};
