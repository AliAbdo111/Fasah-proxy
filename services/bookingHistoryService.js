const BookingHistory = require('../routes/models/BookingHistory');

function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k).toLowerCase();
    if (key.includes('token') || key.includes('password')) continue;
    out[k] = sanitize(v);
  }
  return out;
}

async function logBooking({
  userId,
  endpoint,
  kind = 'other',
  success,
  httpStatus = 200,
  message = '',
  requestBody = {},
  requestQuery = {},
  responseBody = {}
}) {
  try {
    await BookingHistory.create({
      userId,
      endpoint,
      kind,
      success: Boolean(success),
      httpStatus,
      message: String(message || ''),
      requestBody: sanitize(requestBody),
      requestQuery: sanitize(requestQuery),
      responseBody: sanitize(responseBody)
    });
  } catch (err) {
    // history must never break booking flow
    console.error('BookingHistory log failed:', err.message);
  }
}

const KIND_VALUES = ['transit', 'import', 'other'];

async function listUserBookings({ userId, page = 1, limit = 20, q = '', kind, success }) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const filter = { userId };
  const k = kind != null && String(kind).trim() ? String(kind).trim() : '';
  if (k && KIND_VALUES.includes(k)) {
    filter.kind = k;
  }
  const s = success != null ? String(success).trim().toLowerCase() : '';
  if (s === 'true' || s === 'false') {
    filter.success = s === 'true';
  }
  if (q && String(q).trim()) {
    const needle = String(q).trim();
    filter.$or = [
      { endpoint: { $regex: needle, $options: 'i' } },
      { message: { $regex: needle, $options: 'i' } }
    ];
  }
  const [items, total] = await Promise.all([
    BookingHistory.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
    BookingHistory.countDocuments(filter)
  ]);
  return { items, page: pageNum, limit: limitNum, total };
}

module.exports = {
  logBooking,
  listUserBookings
};
