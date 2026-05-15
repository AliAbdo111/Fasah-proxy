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

/** Collect ids from delete payload: { id }, { ids }, or { appointments: [{ id }] }. */
function extractIdsFromDeletePayload(payload) {
  if (payload == null) return [];
  let data = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      return [];
    }
  }
  const ids = new Set();
  if (data.id != null) ids.add(String(data.id));
  if (Array.isArray(data.ids)) {
    for (const id of data.ids) {
      if (id != null) ids.add(String(id));
    }
  }
  const fromList = extractAppointmentsFromPayload(data);
  for (const item of fromList) {
    const key = appointmentKey(item);
    if (key) ids.add(key);
  }
  return [...ids];
}

/**
 * Merge incoming appointments into existing stored list (append; same id replaces).
 * @returns {{ appointments: object[], count: number, saved: object[] }}
 */
function mergeAppointments(existingParsed, incomingPayload) {
  const existingList = Array.isArray(existingParsed?.appointments)
    ? [...existingParsed.appointments]
    : [];

  const incoming = extractAppointmentsFromPayload(incomingPayload);
  const byId = new Map();
  const savedKeys = new Set();

  for (const item of existingList) {
    const key = appointmentKey(item);
    if (key) byId.set(key, item);
    else byId.set(`__idx_${byId.size}`, item);
  }

  for (const item of incoming) {
    const key = appointmentKey(item);
    if (key) {
      byId.set(key, item);
      savedKeys.add(key);
    } else {
      const fallbackKey = `__new_${byId.size}_${Date.now()}`;
      byId.set(fallbackKey, item);
      savedKeys.add(fallbackKey);
    }
  }

  const appointments = Array.from(byId.values());
  const saved = [];
  for (const key of savedKeys) {
    if (byId.has(key)) saved.push(byId.get(key));
  }

  return { appointments, count: appointments.length, saved };
}

/**
 * Remove appointments by id from stored list.
 * @returns {{ appointments: object[], count: number, deleted: object[], deletedIds: string[] }}
 */
function deleteAppointments(existingParsed, deletePayload) {
  const idsToDelete = extractIdsFromDeletePayload(deletePayload);
  const existingList = Array.isArray(existingParsed?.appointments)
    ? [...existingParsed.appointments]
    : [];

  if (idsToDelete.length === 0) {
    return {
      appointments: existingList,
      count: existingList.length,
      deleted: [],
      deletedIds: [],
      notFoundIds: []
    };
  }

  const deleteSet = new Set(idsToDelete);
  const deleted = [];
  const appointments = [];

  for (const item of existingList) {
    const key = appointmentKey(item);
    if (key && deleteSet.has(key)) {
      deleted.push(item);
      deleteSet.delete(key);
    } else {
      appointments.push(item);
    }
  }

  const notFoundIds = [...deleteSet];
  return {
    appointments,
    count: appointments.length,
    deleted,
    deletedIds: deleted.map((item) => appointmentKey(item)).filter(Boolean),
    notFoundIds
  };
}

function parseStored(raw) {
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Redis key for one user's merged appointment list (survives reconnect / new socket id). */
function redisKeyForUser(userId) {
  return `fasah:user:${String(userId)}:schedule-appointments`;
}

const APPOINTMENTS_TTL_SEC = 60 * 60 * 24 * 7;

module.exports = {
  extractAppointmentsFromPayload,
  extractIdsFromDeletePayload,
  mergeAppointments,
  deleteAppointments,
  parseStored,
  appointmentKey,
  redisKeyForUser,
  APPOINTMENTS_TTL_SEC
};
