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
const CONSUMPTION_VALUES = ['daily', 'monthly', 'paid_extra', 'open'];

function safeDate(value, endOfDay = false) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const hasTime = raw.includes('T');
  const iso = hasTime ? raw : `${raw}${endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z'}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function buildFilter({ userId, q = '', kind, success, consumptionType, fromDate, toDate }) {
  const filter = { userId };
  const k = kind != null && String(kind).trim() ? String(kind).trim() : '';
  if (k && KIND_VALUES.includes(k)) {
    filter.kind = k;
  }
  const s = success != null ? String(success).trim().toLowerCase() : '';
  if (s === 'true' || s === 'false') {
    filter.success = s === 'true';
  }
  const c = consumptionType != null ? String(consumptionType).trim() : '';
  if (c && CONSUMPTION_VALUES.includes(c)) {
    filter.consumptionType = c;
  }
  const from = safeDate(fromDate, false);
  const to = safeDate(toDate, true);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = from;
    if (to) filter.createdAt.$lte = to;
  }
  if (q && String(q).trim()) {
    const needle = String(q).trim();
    filter.$or = [
      { endpoint: { $regex: needle, $options: 'i' } },
      { message: { $regex: needle, $options: 'i' } }
    ];
  }
  return filter;
}

function pick(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return '';
    cur = cur[p];
  }
  return cur == null ? '' : cur;
}

function firstValidated(responseBody) {
  const arr = pick(responseBody, 'result.validated');
  if (Array.isArray(arr) && arr.length > 0) return arr[0];
  return {};
}

function toCsvCell(v) {
  const s = String(v == null ? '' : v).replace(/"/g, '""');
  return `"${s}"`;
}

function rowsToCsv(rows) {
  if (!rows.length) {
    return 'createdAt,kind,success,httpStatus,message';
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => toCsvCell(r[h])).join(','));
  }
  return lines.join('\n');
}

async function listUserBookings({ userId, page = 1, limit = 20, q = '', kind, success, consumptionType, fromDate, toDate }) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const filter = buildFilter({ userId, q, kind, success, consumptionType, fromDate, toDate });
  const [items, total] = await Promise.all([
    BookingHistory.find(filter).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
    BookingHistory.countDocuments(filter)
  ]);
  return { items, page: pageNum, limit: limitNum, total };
}

async function exportUserBookingsCsv({
  userId,
  q = '',
  kind,
  success,
  consumptionType,
  fromDate,
  toDate
}) {
  const filter = buildFilter({ userId, q, kind, success, consumptionType, fromDate, toDate });
  const items = await BookingHistory.find(filter).sort({ createdAt: -1 }).limit(5000);
  const rows = items.map((it) => {
    const req = it.requestBody || {};
    const validated = firstValidated(it.responseBody || {});
    const driverId = validated.driverId || {};
    return {
      createdAt: it.createdAt ? it.createdAt.toISOString() : '',
      endpoint: it.endpoint || '',
      kind: it.kind || '',
      success: Boolean(it.success),
      httpStatus: it.httpStatus ?? '',
      userType: req.userType || '',
      cargo_type: req.cargo_type || '',
      declaration_number: req.declaration_number || '',
      port_code: req.port_code || '',
      purpose: req.purpose || '',
      zone_schedule_id: req.zone_schedule_id || '',
      vehicleSequenceNumber: pick(req, 'fleet_info.vehicleSequenceNumber') || '',
      plateCountry: pick(req, 'fleet_info.plateCountry') || '',
      chassisNo: pick(req, 'fleet_info.chassisNo') || '',
      licenseNo: driverId.licenseNo || '',
      residentCountry: driverId.residentCountry || '',
      fullPlateNumber: validated.fullPlateNumber || '',
      driverName: validated.driverName || '',
      tasBookRef: validated.tasBookRef || '',
      appointmentStatus: validated.appointmentStatus || '',
      validated: validated.validated === undefined ? '' : Boolean(validated.validated),
      errorMassage: validated.errorMassage || '',
      surveyLink: validated.surveyLink || '',
      extraPriceApplied: it.extraPriceApplied ?? '',
      consumptionType: it.consumptionType || '',
      message: it.message || ''
    };
  });
  return {
    filename: `booking-history-${String(userId)}-${new Date().toISOString().slice(0, 10)}.csv`,
    csv: rowsToCsv(rows),
    total: rows.length
  };
}

module.exports = {
  logBooking,
  listUserBookings,
  exportUserBookingsCsv
};
