const User = require('../routes/models/User');

const FEATURE_TRANSIT_BOOKING = 'transit_booking';
const FEATURE_IMPORT_BOOKING = 'import_booking';
const DEFAULT_USER_FEATURES = [FEATURE_TRANSIT_BOOKING, FEATURE_IMPORT_BOOKING];

const PLAN_LIMITED = 'limited';
const PLAN_MONTHLY_ONLY = 'monthly_only';
const PLAN_OPEN = 'open';

const CONSUMPTION_DAILY = 'daily';
const CONSUMPTION_MONTHLY = 'monthly';
const CONSUMPTION_PAID_EXTRA = 'paid_extra';
const CONSUMPTION_OPEN = 'open';

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

function defaultMaxDailyBookings() {
  const n = parseInt(process.env.MAX_BOOKINGS_PER_DAY || '50', 10);
  return Number.isFinite(n) && n >= 0 ? n : 50;
}

function defaultMaxMonthlyBookings() {
  const n = parseInt(process.env.MAX_BOOKINGS_PER_MONTH || '1000', 10);
  return Number.isFinite(n) && n >= 0 ? n : 1000;
}

function normalizePlanType(user) {
  const p = user && user.planType;
  if (p === PLAN_MONTHLY_ONLY || p === PLAN_OPEN || p === PLAN_LIMITED) return p;
  return PLAN_LIMITED;
}

function totalDailyBookings(user) {
  return (user.transitBookingCount || 0) + (user.importBookingCount || 0);
}

function totalMonthlyBookings(user) {
  return (user.totalMonthlyTransitBookingCount || 0) + (user.totalMonthlyImportBookingCount || 0);
}

function effectiveMaxDaily(user) {
  if (user.maxDailyBookings != null && user.maxDailyBookings >= 0) return user.maxDailyBookings;
  return defaultMaxDailyBookings();
}

function effectiveMaxMonthly(user) {
  if (user.maxMonthlyBookings != null && user.maxMonthlyBookings >= 0) return user.maxMonthlyBookings;
  return defaultMaxMonthlyBookings();
}

function effectiveExtraPrice(user) {
  const n = Number(user.extraBookingPrice ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

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
    {
      $set: {
        transitBookingCount: 0,
        importBookingCount: 0,
        lastBookingCountDay: today
      }
    }
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
        paidExtraBookingsCount: 0,
        paidExtraAmount: 0,
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

function resolveFeaturesForApi(user) {
  const f = user.features;
  if (f === undefined || f === null) return [...DEFAULT_USER_FEATURES];
  return Array.isArray(f) ? [...f] : [...DEFAULT_USER_FEATURES];
}

function bookingStatsPayload(user) {
  return {
    bookingCount: user.bookingCount || 0,
    transitBookingCount: user.transitBookingCount || 0,
    importBookingCount: user.importBookingCount || 0,
    totalMonthlyTransitBookingCount: user.totalMonthlyTransitBookingCount || 0,
    totalMonthlyImportBookingCount: user.totalMonthlyImportBookingCount || 0,
    totalDailyBookings: totalDailyBookings(user),
    totalMonthlyBookings: totalMonthlyBookings(user),
    maxTransitBookingCount: user.maxTransitBookingCount ?? defaultMaxTransit(),
    maxImportBookingCount: user.maxImportBookingCount ?? defaultMaxImport(),
    planType: normalizePlanType(user),
    dailyLimitEnabled: Boolean(user.dailyLimitEnabled),
    maxDailyBookings: effectiveMaxDaily(user),
    maxMonthlyBookings: effectiveMaxMonthly(user),
    allowPaidExtra: Boolean(user.allowPaidExtra),
    extraBookingPrice: effectiveExtraPrice(user),
    paidExtraBookingsCount: user.paidExtraBookingsCount || 0,
    paidExtraAmount: user.paidExtraAmount || 0,
    packageName: user.packageName || '',
    packagePriceSar: user.packagePriceSar != null ? user.packagePriceSar : 0,
    subscriptionEndsAt: user.subscriptionEndsAt || null,
    lastBookingCountDay: user.lastBookingCountDay,
    lastBookingCountMonth: user.lastBookingCountMonth,
    features: resolveFeaturesForApi(user)
  };
}

async function loadUserBookingState(userId) {
  await syncUserBookingDay(userId);
  return User.findById(userId).select(
    'transitBookingCount importBookingCount totalMonthlyTransitBookingCount totalMonthlyImportBookingCount maxTransitBookingCount maxImportBookingCount bookingCount features lastBookingCountDay lastBookingCountMonth planType dailyLimitEnabled allowPaidExtra extraBookingPrice maxDailyBookings maxMonthlyBookings paidExtraBookingsCount paidExtraAmount packageName packagePriceSar subscriptionEndsAt'
  );
}

function isSubscriptionExpired(user) {
  if (!user || !user.subscriptionEndsAt) return false;
  const t = new Date(user.subscriptionEndsAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() > t;
}

function resolveConsumptionDecision(user) {
  const planType = normalizePlanType(user);
  const dailyTotal = totalDailyBookings(user);
  const monthlyTotal = totalMonthlyBookings(user);
  const maxDaily = effectiveMaxDaily(user);
  const maxMonthly = effectiveMaxMonthly(user);
  const dailyEnabled = planType === PLAN_LIMITED || (planType === PLAN_MONTHLY_ONLY && Boolean(user.dailyLimitEnabled));
  const dailyExceeded = dailyEnabled && dailyTotal >= maxDaily;
  const monthlyExceeded = monthlyTotal >= maxMonthly;

  if (planType === PLAN_OPEN) {
    return { allowed: true, consumptionType: CONSUMPTION_OPEN, extraPriceApplied: 0 };
  }
  if (!dailyExceeded) {
    return { allowed: true, consumptionType: CONSUMPTION_DAILY, extraPriceApplied: 0 };
  }
  if (!monthlyExceeded) {
    return { allowed: true, consumptionType: CONSUMPTION_MONTHLY, extraPriceApplied: 0 };
  }
  if (Boolean(user.allowPaidExtra)) {
    return {
      allowed: true,
      consumptionType: CONSUMPTION_PAID_EXTRA,
      extraPriceApplied: effectiveExtraPrice(user)
    };
  }
  return {
    allowed: false,
    status: 403,
    message: `Monthly booking limit reached (${maxMonthly} per month)`
  };
}

async function assertCanBook(userId, kind) {
  const user = await loadUserBookingState(userId);
  if (!user) throw { status: 404, message: 'User not found' };
  if (isSubscriptionExpired(user)) {
    throw { status: 403, message: 'Subscription expired. Please renew your package.' };
  }
  if (kind === 'transit' && !userHasFeature(user, FEATURE_TRANSIT_BOOKING)) {
    throw { status: 403, message: 'Transit booking is not enabled for this account (missing transit_booking feature)' };
  }
  if (kind === 'import' && !userHasFeature(user, FEATURE_IMPORT_BOOKING)) {
    throw { status: 403, message: 'Import (land) booking is not enabled for this account (missing import_booking feature)' };
  }
  const decision = resolveConsumptionDecision(user);
  if (!decision.allowed) {
    throw { status: decision.status || 403, message: decision.message || 'Booking limit reached' };
  }
  return { user, decision };
}

async function assertCanTransitBook(userId) {
  return assertCanBook(userId, 'transit');
}

async function assertCanImportBook(userId) {
  return assertCanBook(userId, 'import');
}

async function recordBookingSuccess(userId, kind, decision) {
  await syncUserBookingDay(userId);
  const inc = { bookingCount: 1 };
  if (kind === 'transit') {
    inc.transitBookingCount = 1;
    inc.totalMonthlyTransitBookingCount = 1;
  } else {
    inc.importBookingCount = 1;
    inc.totalMonthlyImportBookingCount = 1;
  }
  if (decision && decision.consumptionType === CONSUMPTION_PAID_EXTRA) {
    inc.paidExtraBookingsCount = 1;
    inc.paidExtraAmount = Number(decision.extraPriceApplied || 0);
  }
  await User.findByIdAndUpdate(userId, { $inc: inc });
}

async function recordTransitBookingSuccess(userId, decision) {
  return recordBookingSuccess(userId, 'transit', decision);
}

async function recordImportBookingSuccess(userId, decision) {
  return recordBookingSuccess(userId, 'import', decision);
}

async function resetAllUsersDailyBookingCounters() {
  const today = bookingDayYmd();
  const res = await User.updateMany(
    {},
    { $set: { transitBookingCount: 0, importBookingCount: 0, lastBookingCountDay: today } }
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
  PLAN_LIMITED,
  PLAN_MONTHLY_ONLY,
  PLAN_OPEN,
  CONSUMPTION_DAILY,
  CONSUMPTION_MONTHLY,
  CONSUMPTION_PAID_EXTRA,
  CONSUMPTION_OPEN,
  bookingDayTimezone,
  bookingDayYmd,
  bookingDayYm,
  utcYmd,
  utcYm,
  defaultMaxTransit,
  defaultMaxImport,
  defaultMaxDailyBookings,
  defaultMaxMonthlyBookings,
  syncUserBookingDay,
  loadUserBookingState,
  userHasFeature,
  totalDailyBookings,
  totalMonthlyBookings,
  resolveFeaturesForApi,
  bookingStatsPayload,
  resolveConsumptionDecision,
  assertCanBook,
  assertCanTransitBook,
  assertCanImportBook,
  recordBookingSuccess,
  recordTransitBookingSuccess,
  recordImportBookingSuccess,
  resetAllUsersDailyBookingCounters
};
