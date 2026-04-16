const User = require('../routes/models/User');

/** Enable POST /api/fasah/appointment/transit/create */
const FEATURE_TRANSIT_BOOKING = 'transit_booking';
/** Enable POST /api/zatca-tas/v2/appointment/land/create */
const FEATURE_IMPORT_BOOKING = 'import_booking';

const DEFAULT_USER_FEATURES = [FEATURE_TRANSIT_BOOKING, FEATURE_IMPORT_BOOKING];

/** Daily/month windows follow this IANA zone (default Cairo). Override with BOOKING_DAY_TIMEZONE or BOOKING_DAILY_RESET_TZ. */
function bookingDayTimezone() {
  return process.env.BOOKING_DAY_TIMEZONE || process.env.BOOKING_DAILY_RESET_TZ || 'Africa/Cairo';
}

function bookingDayYmd(d = new Date()) {
  const tz = bookingDayTimezone();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

function bookingDayYm(d = new Date()) {
  return bookingDayYmd(d).slice(0, 7);
}

function utcYmd(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function utcYm(d = new Date()) {
  return d.toISOString().slice(0, 7);
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
 * Sync daily and monthly windows in bookingDayTimezone() (default Africa/Cairo):
 * - day change => reset transitBookingCount/importBookingCount
 * - month change => reset totalMonthlyTransitBookingCount/totalMonthlyImportBookingCount
 */
async function syncUserBookingDay(userId) {
  const today = bookingDayYmd();
  const month = bookingDayYm();
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
  await User.updateOne(
    {
      _id: userId,
      $or: [
        { lastBookingCountMonth: { $exists: false } },
        { lastBookingCountMonth: null },
        { lastBookingCountMonth: '' },
        { lastBookingCountMonth: { $ne: month } }
      ]
    },
    {
      $set: {
        totalMonthlyTransitBookingCount: 0,
        totalMonthlyImportBookingCount: 0,
        lastBookingCountMonth: month
      }
    }
  );
}

function userHasFeature(user, feature) {
  const f = user.features;
  if (f === undefined || f === null) return true;
  if (!Array.isArray(f)) return true;
  return f.includes(feature);
}

function totalDailyBookings(user) {
  return (user.transitBookingCount || 0) + (user.importBookingCount || 0);
}

/** For API: missing features on document → show defaults (legacy full access). */
function resolveFeaturesForApi(user) {
  const f = user.features;
  if (f === undefined || f === null) return [...DEFAULT_USER_FEATURES];
  return Array.isArray(f) ? [...f] : [...DEFAULT_USER_FEATURES];
}

function bookingStatsPayload(user) {
  return {
    bookingCount: user.bookingCount,
    transitBookingCount: user.transitBookingCount,
    importBookingCount: user.importBookingCount,
    totalMonthlyTransitBookingCount: user.totalMonthlyTransitBookingCount || 0,
    totalMonthlyImportBookingCount: user.totalMonthlyImportBookingCount || 0,
    totalDailyBookings: totalDailyBookings(user),
    maxTransitBookingCount: effectiveMaxTransit(user),
    maxImportBookingCount: effectiveMaxImport(user),
    lastBookingCountDay: user.lastBookingCountDay,
    lastBookingCountMonth: user.lastBookingCountMonth,
    features: resolveFeaturesForApi(user)
  };
}

async function loadUserBookingState(userId) {
  await syncUserBookingDay(userId);
  return User.findById(userId).select(
    'transitBookingCount importBookingCount totalMonthlyTransitBookingCount totalMonthlyImportBookingCount maxTransitBookingCount maxImportBookingCount lastBookingCountDay lastBookingCountMonth bookingCount features'
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
  if (!userHasFeature(u, FEATURE_TRANSIT_BOOKING)) {
    throw { status: 403, message: 'Transit booking is not enabled for this account (missing transit_booking feature)' };
  }
  const max = effectiveMaxTransit(u);
  if ((u.transitBookingCount || 0) >= max) {
    throw { status: 403, message: `Daily transit booking limit reached (${max} per day)` };
  }
  return u;
}

async function assertCanImportBook(userId) {
  const u = await loadUserBookingState(userId);
  if (!u) throw { status: 404, message: 'User not found' };
  if (!userHasFeature(u, FEATURE_IMPORT_BOOKING)) {
    throw { status: 403, message: 'Import (land) booking is not enabled for this account (missing import_booking feature)' };
  }
  const max = effectiveMaxImport(u);
  if ((u.importBookingCount || 0) >= max) {
    throw { status: 403, message: `Daily import (land) booking limit reached (${max} per day)` };
  }
  return u;
}

async function recordTransitBookingSuccess(userId) {
  await syncUserBookingDay(userId);
  await User.findByIdAndUpdate(userId, {
    $inc: {
      transitBookingCount: 1,
      totalMonthlyTransitBookingCount: 1,
      bookingCount: 1
    }
  });
}

async function recordImportBookingSuccess(userId) {
  await syncUserBookingDay(userId);
  await User.findByIdAndUpdate(userId, {
    $inc: {
      importBookingCount: 1,
      totalMonthlyImportBookingCount: 1,
      bookingCount: 1
    }
  });
}

/**
 * Reset daily transit/import counters for all users (cron / admin).
 * Does not change bookingCount or monthly totals.
 */
async function resetAllUsersDailyBookingCounters() {
  const today = bookingDayYmd();
  const res = await User.updateMany(
    {},
    {
      $set: {
        transitBookingCount: 0,
        importBookingCount: 0,
        lastBookingCountDay: today
      }
    }
  );
  return {
    matched: res.matchedCount ?? res.n ?? 0,
    modified: res.modifiedCount ?? res.nModified ?? 0,
    day: today
  };
}

module.exports = {
  FEATURE_TRANSIT_BOOKING,
  FEATURE_IMPORT_BOOKING,
  DEFAULT_USER_FEATURES,
  bookingDayTimezone,
  bookingDayYmd,
  bookingDayYm,
  utcYmd,
  utcYm,
  defaultMaxTransit,
  defaultMaxImport,
  syncUserBookingDay,
  loadUserBookingState,
  userHasFeature,
  totalDailyBookings,
  resolveFeaturesForApi,
  bookingStatsPayload,
  effectiveMaxTransit,
  effectiveMaxImport,
  assertCanTransitBook,
  assertCanImportBook,
  recordTransitBookingSuccess,
  recordImportBookingSuccess,
  resetAllUsersDailyBookingCounters
};
