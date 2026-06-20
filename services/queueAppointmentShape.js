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

  if (slot?.zone_schedule_id != null && submit.zone_schedule_id == null) {
    submit.zone_schedule_id = String(slot.zone_schedule_id);
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
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    const err = new Error('MongoDB is not connected');
    err.status = 503;
    throw err;
  }
}

module.exports = {
  QUEUE_STATUS,
  VALID_STATUSES,
  normalizeQueueAppointmentInput,
  toQueueAppointmentResponse,
  assertMongoReady
};
