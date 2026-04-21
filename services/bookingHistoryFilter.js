const KIND_VALUES = ['transit', 'import', 'other'];
const CONSUMPTION_VALUES = ['daily', 'monthly', 'paid_extra', 'open'];

function parseDayStart(isoDate) {
  const s = isoDate != null ? String(isoDate).trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDayEnd(isoDate) {
  const s = isoDate != null ? String(isoDate).trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T23:59:59.999Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function buildFilter({ userId, q, kind, success, consumptionType, fromDate, toDate }) {
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
  if (q && String(q).trim()) {
    const needle = String(q).trim();
    filter.$or = [
      { endpoint: { $regex: needle, $options: 'i' } },
      { message: { $regex: needle, $options: 'i' } }
    ];
  }
  const start = parseDayStart(fromDate);
  const end = parseDayEnd(toDate);
  if (start || end) {
    filter.createdAt = {};
    if (start) filter.createdAt.$gte = start;
    if (end) filter.createdAt.$lte = end;
  }
  return filter;
}

module.exports = { buildFilter };
