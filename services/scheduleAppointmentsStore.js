/** Normalize save payload → list of appointment objects. */
function extractAppointmentsFromPayload(payload) {
  if (payload == null) return [];
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      return [];
    }
  }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.appointments)) return data.appointments;
  if (typeof data === 'object' && data.id != null) return [data];
  return [];
}

function appointmentKey(item) {
  if (item == null || typeof item !== 'object') return null;
  const id = item.id ?? item._id ?? item.appointmentId;
  return id != null ? String(id) : null;
}

/**
 * Merge incoming appointments into existing stored list (append; same id replaces).
 * @param {object|null} existingParsed — previously stored JSON
 * @param {object|array} incomingPayload — client save body
 * @returns {{ appointments: object[], count: number }}
 */
function mergeAppointments(existingParsed, incomingPayload) {
  const existingList = Array.isArray(existingParsed?.appointments)
    ? [...existingParsed.appointments]
    : [];

  const incoming = extractAppointmentsFromPayload(incomingPayload);
  const byId = new Map();

  for (const item of existingList) {
    const key = appointmentKey(item);
    if (key) byId.set(key, item);
    else byId.set(`__idx_${byId.size}`, item);
  }

  for (const item of incoming) {
    const key = appointmentKey(item);
    if (key) {
      byId.set(key, item);
    } else {
      byId.set(`__new_${byId.size}_${Date.now()}`, item);
    }
  }

  const appointments = Array.from(byId.values());
  return { appointments, count: appointments.length };
}

function parseStored(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

module.exports = {
  extractAppointmentsFromPayload,
  mergeAppointments,
  parseStored
};
