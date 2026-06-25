// @ts-nocheck
/* Ported from services/unavailableSlotsStore.js */
import UnavailableSlot from '../schemas/unavailable-slot.schema';

function todaySessionId() {
  return new Date().toISOString().slice(0, 10);
}

async function loadUnavailableIds(sessionId = todaySessionId()) {
  const rows = await UnavailableSlot.find({ sessionId }).select('zone_schedule_id').lean();
  return new Set(rows.map((r) => String(r.zone_schedule_id)));
}

async function markSlotUnavailable({ zone_schedule_id, port_code, sessionId, reason }) {
  const sid = sessionId || todaySessionId();
  const id = String(zone_schedule_id);
  await UnavailableSlot.findOneAndUpdate(
    { sessionId: sid, zone_schedule_id: id },
    {
      $set: {
        sessionId: sid,
        zone_schedule_id: id,
        port_code: port_code != null ? String(port_code) : '',
        reason: reason || 'zero_available_slots',
        markedAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
  return id;
}

async function clearSession(sessionId = todaySessionId()) {
  await UnavailableSlot.deleteMany({ sessionId });
}

export { todaySessionId };
export { loadUnavailableIds };
export { markSlotUnavailable };
export { clearSession };
