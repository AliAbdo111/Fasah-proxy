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
  console.log('[landScheduleExtract] pickSlotForAppointment', {
    schedules: list.length,
    appointment
  });
  const preferredId = getPreferredZoneScheduleId(appointment);
  console.log('[landScheduleExtract] preferredId', preferredId);
  if (preferredId) {
    const match =  list[preferredId]?.zone_schedule_id 
    console.log('[landScheduleExtract] match', match);
    if (match) return match;
  }

  console.log('[landScheduleExtract] no match, returning first bookable');
  return list[Math.floor(Math.random() * list.length)]?.zone_schedule_id;
}

module.exports = {
  extractLandSchedules,
  isBookableSlot,
  pickSlotForAppointment
};
