const { getRedis } = require('./redisClient');
const { parseStored, redisKeyForUser } = require('./scheduleAppointmentsStore');
const User = require('../routes/models/User');

/**
 * Load merged appointment list for a Mongo user id.
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function loadAppointmentsForUser(userId) {
  const uid = String(userId);
  const redis = getRedis();
  if (!redis) {
    const err = new Error('Redis disabled (REDIS_URL=off).');
    err.code = 'REDIS_OFF';
    throw err;
  }

  const key = redisKeyForUser(uid);
  const raw = await redis.get(key);

  if (raw == null) {
    return {
      userId: uid,
      key,
      raw: null,
      parsed: null,
      count: 0,
      appointments: []
    };
  }

  const parsed = parseStored(raw);
  const appointments = Array.isArray(parsed?.appointments) ? parsed.appointments : [];

  return {
    userId: uid,
    key,
    raw,
    parsed: parsed === undefined ? null : parsed,
    count: appointments.length,
    appointments,
    email: parsed?.email ?? null
  };
}

/**
 * Resolve whose appointments to load.
 * - Normal user: own list only (ignores targetUserId).
 * - Admin: optional userId or email in payload.
 */
async function resolveAppointmentsTarget(socket, payload) {
  if (!socket.data.userId) {
    return {
      ok: false,
      status: 401,
      message: 'Login required: connect with app JWT (auth.token) and socket:identify first'
    };
  }

  const requesterId = String(socket.data.userId);
  const isAdmin = socket.data.role === 'admin';
  let targetUserId =
    payload?.userId != null
      ? String(payload.userId)
      : payload?.targetUserId != null
        ? String(payload.targetUserId)
        : null;

  if (!targetUserId && isAdmin && payload?.email) {
    const email = String(payload.email).toLowerCase().trim();
    const user = await User.findOne({ email }).select('_id email');
    if (!user) {
      return { ok: false, status: 404, message: 'User not found for email' };
    }
    targetUserId = String(user._id);
  }

  if (!targetUserId || targetUserId === requesterId) {
    return {
      ok: true,
      targetUserId: requesterId,
      requestedBy: requesterId,
      asAdmin: false
    };
  }

  if (!isAdmin) {
    return {
      ok: false,
      status: 403,
      message: 'Forbidden: only admin can load another user\'s appointments'
    };
  }

  const targetUser = await User.findById(targetUserId).select('_id email');
  if (!targetUser) {
    return { ok: false, status: 404, message: 'Target user not found' };
  }

  return {
    ok: true,
    targetUserId: String(targetUser._id),
    targetEmail: targetUser.email,
    requestedBy: requesterId,
    asAdmin: true
  };
}

module.exports = {
  loadAppointmentsForUser,
  resolveAppointmentsTarget
};
