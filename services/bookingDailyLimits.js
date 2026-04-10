const User = require('../routes/models/User');

function utcYmd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function defaultMaxTransit() {
  const n = parseInt(process.env.MAX_TRANSIT_BOOKINGS_PER_DAY || '50', 10);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

function defaultMaxImport() {
  const n = parseInt(process.env.MAX_IMPORT_BOOKINGS_PER_DAY || '50', 10);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

/**
 * If stored day !== today (UTC), reset daily counters and set lastBookingCountDay.
 */
async function syncUserBookingDay(userId) {
  const today = utcYmd();
  await User.updateOne(
    {
      _id: userId,
      $or: [
        { lastBookingCountDay: { $exists: false } },
        { lastBookingCountDay: null },
        { lastBookingCountDay: '' },
        { lastBookingCountDay: { $ne: today } }
      ]
    },
    { $set: { transitBookingCount: 0, importBookingCount: 0, lastBookingCountDay: today } }
  );
}

async function loadUserBookingState(userId) {
  await syncUserBookingDay(userId);
  return User.findById(userId).select(
    'transitBookingCount importBookingCount maxTransitBookingCount maxImportBookingCount lastBookingCountDay bookingCount'
  );
}

function effectiveMaxTransit(u) {
  const m = u.maxTransitBookingCount;
  return m != null && m >= 0 ? m : defaultMaxTransit();
}

function effectiveMaxImport(u) {
  const m = u.maxImportBookingCount;
  return m != null && m >= 0 ? m : defaultMaxImport();
}

async function assertCanTransitBook(userId) {
  const u = await loadUserBookingState(userId);
  if (!u) throw { status: 404, message: 'User not found' };
  const max = effectiveMaxTransit(u);
  if ((u.transitBookingCount || 0) >= max) {
    throw { status: 403, message: `Daily transit booking limit reached (${max} per day)` };
  }
  return u;
}

async function assertCanImportBook(userId) {
  const u = await loadUserBookingState(userId);
  if (!u) throw { status: 404, message: 'User not found' };
  const max = effectiveMaxImport(u);
  if ((u.importBookingCount || 0) >= max) {
    throw { status: 403, message: `Daily import (land) booking limit reached (${max} per day)` };
  }
  return u;
}

async function recordTransitBookingSuccess(userId) {
  await syncUserBookingDay(userId);
  await User.findByIdAndUpdate(userId, { $inc: { transitBookingCount: 1, bookingCount: 1 } });
}

async function recordImportBookingSuccess(userId) {
  await syncUserBookingDay(userId);
  await User.findByIdAndUpdate(userId, { $inc: { importBookingCount: 1, bookingCount: 1 } });
}

module.exports = {
  utcYmd,
  defaultMaxTransit,
  defaultMaxImport,
  syncUserBookingDay,
  loadUserBookingState,
  effectiveMaxTransit,
  effectiveMaxImport,
  assertCanTransitBook,
  assertCanImportBook,
  recordTransitBookingSuccess,
  recordImportBookingSuccess
};
