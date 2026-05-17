/**
 * Frontend appointment queue shape (id, appointment, vehicle, driver, token meta, submitData).
 * submitData is sent to FASAH create without token / userType (those come from poll).
 */

const { appointmentKey } = require('./scheduleAppointmentsStore');

/** submitData for Redis / FASAH create body — no duplicate bearer or userType. */
function stripSubmitDataSecrets(submitData) {
  if (!submitData || typeof submitData !== 'object') return submitData;
  const { token, userType, ...rest } = submitData;
  return { ...rest };
}

function resolveFasahBearer(appointment) {
  if (!appointment || typeof appointment !== 'object') return '';
  const block = appointment.token;
  if (block && typeof block === 'object' && block.token) {
    return String(block.token);
  }
  if (typeof block === 'string') return block;
  if (appointment.submitData?.token) return String(appointment.submitData.token);
  return '';
}

/** Ensure token: { token: Bearer…, declarationNumber, type, vehicleType }. */
function normalizeTokenBlock(appointment) {
  const prev = appointment?.token;
  const bearer = resolveFasahBearer(appointment);
  const meta = typeof prev === 'object' && prev ? { ...prev } : {};

  if (bearer) {
    meta.token = bearer.startsWith('Bearer ') ? bearer : `Bearer ${bearer.replace(/^Bearer\s+/i, '')}`;
  }

  if (meta.declarationNumber == null && appointment?.submitData?.declaration_number != null) {
    meta.declarationNumber = String(appointment.submitData.declaration_number);
  }
  if (meta.declarationNumber == null && appointment?.declaration_number != null) {
    meta.declarationNumber = String(appointment.declaration_number);
  }

  if (!meta.type) {
    meta.type = appointment?.submitData?.userType || appointment?.userType || 'broker';
  }
  if (meta.vehicleType == null && appointment?.token?.vehicleType != null) {
    meta.vehicleType = appointment.token.vehicleType;
  }

  return Object.keys(meta).length ? meta : prev;
}

/** Normalize for Redis + socket responses (keeps FASAH JWT on token.token). */
function sanitizeAppointmentForClient(appointment) {
  if (!appointment || typeof appointment !== 'object') return appointment;
  const out = { ...appointment };

  // Copy bearer into token.token while it may still live on submitData.token
  out.token = normalizeTokenBlock(out);

  if (out.submitData) {
    out.submitData = stripSubmitDataSecrets(out.submitData);
  }

  return out;
}

function normalizeAppointmentForRedis(appointment) {
  return sanitizeAppointmentForClient(appointment);
}

function getPreferredZoneScheduleId(appointment) {
  if (!appointment) return null;
  const fromSubmit = appointment.submitData?.zone_schedule_id;
  const fromSlot = appointment.appointment?.selectedSlot?.zone_schedule_id;
  const flat = appointment.zone_schedule_id;
  const id = fromSubmit ?? fromSlot ?? flat;
  return id != null ? String(id) : null;
}

function resolveFleetInfo(appointment) {
  const sd = appointment?.submitData;
  if (Array.isArray(sd?.fleet_info) && sd.fleet_info.length) {
    return sd.fleet_info;
  }
  if (Array.isArray(appointment?.fleet_info) && appointment.fleet_info.length) {
    return appointment.fleet_info;
  }
  const driver = appointment?.driver;
  const vehicle = appointment?.vehicle;
  if (driver && vehicle) {
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
  return null;
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

/** True when queue row has enough data to call create-transit. */
function hasBookingPayload(appointment) {
  const declaration_number = resolveDeclarationNumber(appointment);
  const purpose = resolvePurpose(appointment);
  const fleet_info = resolveFleetInfo(appointment);
  return Boolean(declaration_number && purpose && fleet_info?.length);
}

/**
 * Body for executeTransitBooking / createTransitAppointment.
 * Uses submitData without token & userType; token from poll FASAH JWT.
 */
function buildTransitCreateBody(appointment, slot, fasahToken, userTypeFallback) {
  const zone_schedule_id = String(slot.zone_schedule_id);
  const token = String(fasahToken || resolveFasahBearer(appointment) || '')
    .replace(/^Bearer\s+/i, '');
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

function applyBookedState(appointment, { slot, tasBookRef }) {
  const bookedAt = new Date().toISOString();
  const prev = appointment || {};
  const submitData = prev.submitData
    ? { ...stripSubmitDataSecrets(prev.submitData), zone_schedule_id: String(slot.zone_schedule_id) }
    : undefined;

  return sanitizeAppointmentForClient({
    ...prev,
    status: 'booked',
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
    submitData
  });
}

function applyFailedState(appointment, message) {
  return sanitizeAppointmentForClient({
    ...appointment,
    status: 'failed',
    lastError: message,
    updatedAt: new Date().toISOString()
  });
}

const MAX_BOOKING_ATTEMPTS = 3;

function getBookingAttempts(appointment) {
  const n = Number(appointment?.bookingAttempts);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

/** True while this row still needs a booking try (success or 3 failures ends it). */
function needsBooking(appointment) {
  if (!appointment || typeof appointment !== 'object') return false;
  const status = String(appointment.status || 'pending').toLowerCase();
  if (status === 'booked' || status === 'success' || status === 'cancelled') return false;
  return getBookingAttempts(appointment) < MAX_BOOKING_ATTEMPTS;
}

/**
 * Record a failed try; after MAX_BOOKING_ATTEMPTS mark status failed.
 * @returns {{ record: object, isFinalFailure: boolean, attempts: number }}
 */
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
    : sanitizeAppointmentForClient({ ...base, status: 'pending' });
  return { record, isFinalFailure, attempts };
}

module.exports = {
  MAX_BOOKING_ATTEMPTS,
  getBookingAttempts,
  needsBooking,
  applyBookingAttemptFailure,
  appointmentKey,
  sanitizeAppointmentForClient,
  normalizeAppointmentForRedis,
  resolveFasahBearer,
  normalizeTokenBlock,
  stripSubmitDataSecrets,
  getPreferredZoneScheduleId,
  hasBookingPayload,
  buildTransitCreateBody,
  applyBookedState,
  applyFailedState,
  resolveDeclarationNumber,
  resolvePurpose,
  resolveFleetInfo
};
