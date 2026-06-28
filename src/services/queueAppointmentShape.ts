// @ts-nocheck
/* Ported from services/queueAppointmentShape.js */
import mongoose from 'mongoose';
/**
 * Queue appointment document shape for MongoDB CRUD.
 * { id, status, appointment, vehicle, driver, token, submitData }
 */

const QUEUE_STATUS = {
  IN_QUEUE: 'in_queue',
  PENDING: 'pending',
  BOOKED: 'booked',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  SUCCESS: 'success'
};

const VALID_STATUSES = Object.values(QUEUE_STATUS);

function stripSubmitDataSecrets(submitData) {
  if (!submitData || typeof submitData !== 'object') return submitData;
  const { token, userType, ...rest } = submitData;
  return { ...rest };
}

function resolveBearer(appointment) {
  if (!appointment || typeof appointment !== 'object') return '';
  const block = appointment.token;
  if (block && typeof block === 'object' && block.token) return String(block.token);
  if (typeof block === 'string') return block;
  if (appointment.submitData?.token) return String(appointment.submitData.token);
  return '';
}

function normalizeTokenBlock(appointment) {
  const prev = appointment?.token;
  const bearer = resolveBearer(appointment);
  const meta = typeof prev === 'object' && prev ? { ...prev } : {};

  if (bearer) {
    meta.token = bearer.startsWith('Bearer ')
      ? bearer
      : `Bearer ${bearer.replace(/^Bearer\s+/i, '')}`;
  }

  if (meta.declarationNumber == null && appointment?.submitData?.declaration_number != null) {
    meta.declarationNumber = String(appointment.submitData.declaration_number);
  }

  if (!meta.type) {
    meta.type = appointment?.submitData?.userType || appointment?.userType || 'broker';
  }
  if (meta.vehicleType == null && appointment?.token?.vehicleType != null) {
    meta.vehicleType = appointment.token.vehicleType;
  }

  return Object.keys(meta).length ? meta : prev;
}

function buildFleetInfoFromParts(appointment) {
  const driver = appointment?.driver;
  const vehicle = appointment?.vehicle;
  if (!driver || !vehicle) return null;
  return [
    {
      licenseNo: driver.licenseNo,
      residentCountry: driver.residentCountry,
      chassisNo: vehicle.chassisNo,
      plateCountry: vehicle.plateCountry,
      vehicleSequenceNumber: vehicle.vehicleSequenceNumber
    }
  ];
}

/** Normalize incoming body before save. Keeps FASAH JWT on token.token. */
function normalizeQueueAppointmentInput(body, { existingId } = {}) {
  if (!body || typeof body !== 'object') {
    const err = new Error('Request body must be an object');
    err.status = 400;
    throw err;
  }

  const out = { ...body };
  out.id = out.id != null ? String(out.id) : existingId || String(Date.now());

  const status = String(out.status || QUEUE_STATUS.IN_QUEUE).toLowerCase();
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`);
    err.status = 400;
    throw err;
  }
  out.status = status;

  const slot = out.appointment?.selectedSlot;
  const submit = out.submitData && typeof out.submitData === 'object' ? { ...out.submitData } : {};
  const scheduleIndex =
    out.zone_schedule_id != null
      ? String(out.zone_schedule_id)
      : submit.zone_schedule_id != null
        ? String(submit.zone_schedule_id)
        : null;

  if (scheduleIndex != null) {
    out.zone_schedule_id = scheduleIndex;
    submit.zone_schedule_id = scheduleIndex;
  }
  if (slot?.port_code != null && submit.port_code == null) {
    submit.port_code = String(slot.port_code);
  }
  if (out.token?.declarationNumber != null && submit.declaration_number == null) {
    submit.declaration_number = String(out.token.declarationNumber);
  }
  if (out.token?.type != null && submit.userType == null) {
    submit.userType = String(out.token.type);
  }
  if (!Array.isArray(submit.fleet_info) || !submit.fleet_info.length) {
    const built = buildFleetInfoFromParts(out);
    if (built) submit.fleet_info = built;
  }

  if (Object.keys(submit).length) {
    out.submitData = submit;
  }

  out.token = normalizeTokenBlock(out);

  return out;
}

/** API response — strips duplicate bearer from submitData. */
function toQueueAppointmentResponse(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const { _id, __v, userId, ...rest } = plain;

  if (rest.submitData) {
    rest.submitData = stripSubmitDataSecrets(rest.submitData);
  }

  return {
    ...rest,
    mongoId: _id ? String(_id) : undefined,
    userId: userId ? String(userId) : undefined
  };
}

function assertMongoReady() {
  if (mongoose.connection.readyState !== 1) {
    const err = new Error('MongoDB is not connected');
    err.status = 503;
    throw err;
  }
}

const MAX_BOOKING_ATTEMPTS = Number(process.env.MAX_BOOKING_ATTEMPTS) || 3;

/** Statuses still polled / retried by the appointment watcher (includes failed after max attempts). */
const WATCHER_QUEUE_STATUSES = [
  QUEUE_STATUS.IN_QUEUE,
  QUEUE_STATUS.PENDING,
  QUEUE_STATUS.FAILED
];

function getBookingAttempts(appointment) {
  const n = Number(appointment?.bookingAttempts);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

function needsBooking(appointment) {
  if (!appointment || typeof appointment !== 'object') return false;
  const status = String(appointment.status || QUEUE_STATUS.IN_QUEUE).toLowerCase();
  if (status === QUEUE_STATUS.BOOKED || status === QUEUE_STATUS.SUCCESS || status === QUEUE_STATUS.CANCELLED) {
    return false;
  }
  return getBookingAttempts(appointment) < MAX_BOOKING_ATTEMPTS;
}

/** Watcher keeps polling while booking attempts remain (stops at MAX_BOOKING_ATTEMPTS). */
function watcherNeedsBooking(appointment) {
  return needsBooking(appointment);
}

function getPreferredZoneScheduleId(appointment) {
  if (!appointment) return null;
  const fromSubmit = appointment.submitData?.zone_schedule_id;
  const flat = appointment.zone_schedule_id;
  const id = fromSubmit ?? flat;
  return id != null ? String(id) : null;
}

/** Stored zone_schedule_id is the schedules array index (e.g. "10" → schedules[10]). */
function getPreferredScheduleIndex(appointment) {
  const raw = getPreferredZoneScheduleId(appointment);
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const index = Number.parseInt(trimmed, 10);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

function resolveFleetInfo(appointment) {
  const sd = appointment?.submitData;
  if (Array.isArray(sd?.fleet_info) && sd.fleet_info.length) return sd.fleet_info;
  return buildFleetInfoFromParts(appointment);
}

function resolveDeclarationNumber(appointment) {
  return (
    appointment?.submitData?.declaration_number ??
    appointment?.declaration_number ??
    appointment?.token?.declarationNumber ??
    null
  );
}

function resolvePurpose(appointment) {
  return appointment?.submitData?.purpose ?? appointment?.purpose ?? null;
}

function resolveUserType(appointment, fallback) {
  return (
    appointment?.submitData?.userType ??
    appointment?.token?.type ??
    appointment?.userType ??
    fallback ??
    'broker'
  );
}

function hasBookingPayload(appointment) {
  const declaration_number = resolveDeclarationNumber(appointment);
  const purpose = resolvePurpose(appointment);
  const fleet_info = resolveFleetInfo(appointment);
  return Boolean(declaration_number && purpose && fleet_info?.length);
}

function buildTransitCreateBody(appointment, slot, fasahToken, userTypeFallback) {
  const zone_schedule_id = String(slot.zone_schedule_id);
  const token = String(fasahToken || resolveBearer(appointment) || '').replace(/^Bearer\s+/i, '');
  const userType = resolveUserType(appointment, userTypeFallback);

  if (appointment?.submitData && typeof appointment.submitData === 'object') {
    const base = stripSubmitDataSecrets(appointment.submitData);
    return {
      port_code: base.port_code || slot.port_code || slot.zone_code,
      zone_schedule_id,
      purpose: String(base.purpose),
      declaration_number: String(base.declaration_number),
      fleet_info: base.fleet_info,
      cargo_type: base.cargo_type || '',
      bayan_appointment: base.bayan_appointment || {},
      token,
      userType
    };
  }

  return {
    port_code: appointment.port_code || slot.port_code || slot.zone_code,
    zone_schedule_id,
    purpose: String(appointment.purpose),
    declaration_number: String(appointment.declaration_number),
    fleet_info: appointment.fleet_info,
    cargo_type: appointment.cargo_type || '',
    bayan_appointment: appointment.bayan_appointment || {},
    token,
    userType
  };
}

function sanitizeAppointmentForStorage(appointment) {
  if (!appointment || typeof appointment !== 'object') return appointment;
  const out = { ...appointment };
  out.token = normalizeTokenBlock(out);
  if (out.submitData) out.submitData = stripSubmitDataSecrets(out.submitData);
  return out;
}

function applyBookedState(appointment, { slot, tasBookRef }) {
  const bookedAt = new Date();
  const prev = appointment || {};
  const submitData = prev.submitData
    ? { ...stripSubmitDataSecrets(prev.submitData), zone_schedule_id: String(slot.zone_schedule_id) }
    : undefined;

  return sanitizeAppointmentForStorage({
    ...prev,
    status: QUEUE_STATUS.BOOKED,
    tasBookRef,
    bookedAt,
    zone_schedule_id: String(slot.zone_schedule_id),
    schedule_from: slot.schedule_from,
    schedule_to: slot.schedule_to,
    appointment: {
      ...(prev.appointment || {}),
      selectedDate: prev.appointment?.selectedDate || bookedAt,
      selectedSlot: { ...slot }
    },
    submitData,
    lastError: undefined
  });
}

function applyFailedState(appointment, message) {
  return sanitizeAppointmentForStorage({
    ...appointment,
    status: QUEUE_STATUS.FAILED,
    lastError: message,
    updatedAt: new Date().toISOString()
  });
}

function applyBookingAttemptFailure(appointment, message) {
  const prev = appointment || {};
  const attempts = getBookingAttempts(prev) + 1;
  const isFinalFailure = attempts >= MAX_BOOKING_ATTEMPTS;
  const base = {
    ...prev,
    bookingAttempts: attempts,
    lastError: message,
    updatedAt: new Date().toISOString()
  };
  const record = isFinalFailure
    ? applyFailedState(base, message)
    : sanitizeAppointmentForStorage({ ...base, status: QUEUE_STATUS.IN_QUEUE });
  return { record, isFinalFailure, attempts };
}

/** Build schedule-check params from first queued appointment for a user. */
function buildScheduleCheckProfile(appointment) {
  const plain = typeof appointment?.toObject === 'function' ? appointment.toObject() : appointment;
  const arrival =
    plain?.submitData?.port_code ||
    plain?.appointment?.selectedSlot?.port_code ||
    plain?.appointment?.selectedSlot?.zone_code;
  const departure = process.env.WATCHER_DEFAULT_DEPARTURE || 'AGF';
  const type = process.env.WATCHER_SCHEDULE_QUERY_TYPE || 'SPECIAL';
  const token = resolveBearer(plain);
  const userType = resolveUserType(plain, 'broker');
  return { departure, arrival: String(arrival || ''), type, token, userType, appointment: plain };
}

export { QUEUE_STATUS };
export { VALID_STATUSES };
export { MAX_BOOKING_ATTEMPTS };
export { WATCHER_QUEUE_STATUSES };
export { normalizeQueueAppointmentInput };
export { toQueueAppointmentResponse };
export { assertMongoReady };
export { stripSubmitDataSecrets };
export { resolveBearer };
export { resolveBearer as resolveFasahBearer };
export { normalizeTokenBlock };
export { buildFleetInfoFromParts };
export { needsBooking };
export { watcherNeedsBooking };
export { getBookingAttempts };
export { getPreferredZoneScheduleId };
export { getPreferredScheduleIndex };
export { resolveFleetInfo };
export { resolveDeclarationNumber };
export { resolvePurpose };
export { resolveUserType };
export { hasBookingPayload };
export { buildTransitCreateBody };
export { sanitizeAppointmentForStorage };
export { applyBookedState };
export { applyFailedState };
export { applyBookingAttemptFailure };
export { buildScheduleCheckProfile };
