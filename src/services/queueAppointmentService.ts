// @ts-nocheck
/* Ported from services/queueAppointmentService.js */
import mongoose from 'mongoose';
import QueueAppointment from '../schemas/queue-appointment.schema';
import {
  normalizeQueueAppointmentInput,
  toQueueAppointmentResponse,
  assertMongoReady,
  QUEUE_STATUS,
  VALID_STATUSES
} from './queueAppointmentShape';
import bookingDailyLimits from './bookingDailyLimits';

const SUCCESS_STATUSES = new Set([QUEUE_STATUS.BOOKED, QUEUE_STATUS.SUCCESS]);

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function buildListFilter({ userId, status }) {
  const filter = {};
  if (userId) {
    filter.userId = mongoose.Types.ObjectId.isValid(String(userId))
      ? new mongoose.Types.ObjectId(String(userId))
      : userId;
  }

  if (status) {
    filter.status = String(status).toLowerCase();
  }

  return filter;
}

function assertUserListAccess({ requesterId, targetUserId, isAdmin }) {
  const target = String(targetUserId);
  if (!mongoose.Types.ObjectId.isValid(target)) {
    const err = new Error('Invalid userId');
    err.status = 400;
    throw err;
  }
  if (!isAdmin && target !== String(requesterId)) {
    const err = new Error('Forbidden: cannot list another user\'s appointments');
    err.status = 403;
    throw err;
  }
  return target;
}

async function listQueueAppointmentsByUser({ requesterId, targetUserId, query, isAdmin }) {
  assertMongoReady();
  const listQuery = { ...query };
  delete listQuery.userId;
  const resolvedUserId = assertUserListAccess({ requesterId, targetUserId, isAdmin });
  const { page, limit, skip } = parsePagination(listQuery);
  const filter = buildListFilter({
    userId: resolvedUserId,
    status: listQuery.status,
    zone_schedule_id: listQuery.zone_schedule_id
  });

  const [items, total] = await Promise.all([
    QueueAppointment.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit),
    QueueAppointment.countDocuments(filter)
  ]);

  return {
    userId: resolvedUserId,
    items: items.map(toQueueAppointmentResponse),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 0
  };
}

async function listQueueAppointments({ userId, query, isAdmin }) {
  const targetUserId = query.userId || userId;
  return listQueueAppointmentsByUser({
    requesterId: userId,
    targetUserId,
    query,
    isAdmin
  });
}

async function createQueueAppointment(userId, body) {
  assertMongoReady();
  const normalized = normalizeQueueAppointmentInput(body);
  const doc = await QueueAppointment.create({
    ...normalized,
    userId
  });
  return toQueueAppointmentResponse(doc);
}

async function getQueueAppointmentById({ userId, queueId, isAdmin }) {
  assertMongoReady();
  const filter = { id: String(queueId) };
  if (!isAdmin) {
    filter.userId = userId;
  }

  const doc = await QueueAppointment.findOne(filter);
  if (!doc) {
    const err = new Error('Queue appointment not found');
    err.status = 404;
    throw err;
  }
  return toQueueAppointmentResponse(doc);
}

async function updateQueueAppointment({ userId, queueId, body, isAdmin, replace = false }) {
  assertMongoReady();
  const filter = { id: String(queueId) };
  if (!isAdmin) {
    filter.userId = userId;
  }

  const existing = await QueueAppointment.findOne(filter);
  if (!existing) {
    const err = new Error('Queue appointment not found');
    err.status = 404;
    throw err;
  }

  const merged = replace
    ? { ...body, id: existing.id }
    : {
        ...existing.toObject(),
        ...body,
        id: existing.id,
        userId: existing.userId,
        _id: existing._id
      };

  delete merged._id;
  delete merged.__v;
  delete merged.createdAt;
  delete merged.updatedAt;
  delete merged.userId;

  const normalized = normalizeQueueAppointmentInput(merged, { existingId: existing.id });

  const doc = await QueueAppointment.findOneAndUpdate(
    filter,
    { $set: normalized },
    { returnDocument: 'after', runValidators: true }
  );

  return toQueueAppointmentResponse(doc);
}

/**
 * Update queue appointment status; when moving to booked/success, increment user booking counters once.
 */
async function updateQueueAppointmentStatus({
  userId,
  queueId,
  isAdmin,
  status,
  tasBookRef,
  lastError,
  recordUserBooking
}) {
  assertMongoReady();
  const filter = { id: String(queueId) };
  if (!isAdmin) {
    filter.userId = userId;
  }

  const existing = await QueueAppointment.findOne(filter);
  if (!existing) {
    const err = new Error('Queue appointment not found');
    err.status = 404;
    throw err;
  }

  if (status == null || status === '') {
    const err = new Error('status is required');
    err.status = 400;
    throw err;
  }

  const nextStatus = String(status).toLowerCase();
  if (!VALID_STATUSES.includes(nextStatus)) {
    const err = new Error(`Invalid status. Allowed: ${VALID_STATUSES.join(', ')}`);
    err.status = 400;
    throw err;
  }

  const prevStatus = String(existing.status || '').toLowerCase();
  const $set = { status: nextStatus };

  if (tasBookRef !== undefined) {
    $set.tasBookRef = tasBookRef ? String(tasBookRef) : undefined;
  }
  if (lastError !== undefined) {
    $set.lastError = lastError ? String(lastError) : undefined;
  }

  if (SUCCESS_STATUSES.has(nextStatus)) {
    $set.bookedAt = existing.bookedAt || new Date();
    if (lastError === undefined) {
      $set.lastError = undefined;
    }
  }

  const doc = await QueueAppointment.findOneAndUpdate(
    filter,
    { $set },
    { returnDocument: 'after', runValidators: true }
  );

  const shouldRecordUserBooking =
    recordUserBooking !== false &&
    SUCCESS_STATUSES.has(nextStatus) &&
    !SUCCESS_STATUSES.has(prevStatus);

  let userBookingRecorded = false;
  if (shouldRecordUserBooking) {
    await bookingDailyLimits.syncUserBookingDay(String(existing.userId));
    await bookingDailyLimits.recordTransitBookingSuccess(String(existing.userId), null);
    userBookingRecorded = true;
  }

  return {
    appointment: toQueueAppointmentResponse(doc),
    userBookingRecorded
  };
}

async function deleteQueueAppointment({ userId, queueId, isAdmin }) {
  assertMongoReady();
  const filter = { id: String(queueId) };
  if (!isAdmin) {
    filter.userId = userId;
  }

  const doc = await QueueAppointment.findOneAndDelete(filter);
  if (!doc) {
    const err = new Error('Queue appointment not found');
    err.status = 404;
    throw err;
  }
  return toQueueAppointmentResponse(doc);
}

function mapMongoError(err) {
  if (err.code === 11000) {
    const e = new Error('Queue appointment with this id already exists for this user');
    e.status = 409;
    return e;
  }
  return err;
}

export { createQueueAppointment };
export { listQueueAppointments };
export { listQueueAppointmentsByUser };
export { getQueueAppointmentById };
export { updateQueueAppointment };
export { updateQueueAppointmentStatus };
export { deleteQueueAppointment };
export { mapMongoError };
