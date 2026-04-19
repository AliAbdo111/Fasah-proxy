/**
 * Seeds two example subscription users (Arabic names / package labels as reference).
 *
 * 1) محمد العدوي — باقة 800: شهري 800، يومي 30، سعر الباقة 3000 ر.س، ينتهي 19/5، إكسترا بعد الشهري 75 ر.س/حجز
 * 2) باقة مفتوحة شهرية — plan open، سعر شهري مرجعي (فوترة)، تاريخ انتهاء منفصل
 *
 * Env:
 *   MONGO_URI (required)
 *   SEED_PACKAGE_PASSWORD (default ChangeMe123!)
 *   SEED_ALODWY_EMAIL (default mohammed.alodwy@seed.local)
 *   SEED_OPEN_MONTHLY_EMAIL (default open.monthly@seed.local)
 *   SEED_OPEN_MONTHLY_PRICE_SAR (default 500)
 *   SEED_SUBSCRIPTION_END_ALODWY (ISO date, default 2026-05-19T23:59:59+03:00)
 *   SEED_SUBSCRIPTION_END_OPEN (ISO date, default 2026-06-19T23:59:59+03:00)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../routes/models/User');
const bookingDailyLimits = require('../services/bookingDailyLimits');

const DEFAULT_FEATURES = [...bookingDailyLimits.DEFAULT_USER_FEATURES];

async function upsertUser(doc) {
  const { email, password, ...rest } = doc;
  const normalized = String(email).trim().toLowerCase();
  let user = await User.findOne({ email: normalized }).select('+password');
  if (!user) {
    user = await User.create({ email: normalized, password, ...rest });
    console.log('Created:', normalized);
  } else {
    Object.assign(user, rest);
    if (password) user.password = password;
    await user.save();
    console.log('Updated:', normalized);
  }
}

async function run() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('MONGO_URI is required');

  const password = String(process.env.SEED_PACKAGE_PASSWORD || 'ChangeMe123!').trim();
  if (password.length < 6) throw new Error('SEED_PACKAGE_PASSWORD must be at least 6 characters');

  const endAlodwy = process.env.SEED_SUBSCRIPTION_END_ALODWY || '2026-05-19T23:59:59+03:00';
  const endOpen = process.env.SEED_SUBSCRIPTION_END_OPEN || '2026-06-19T23:59:59+03:00';
  const openPrice = Number.parseFloat(String(process.env.SEED_OPEN_MONTHLY_PRICE_SAR || '500'));

  await mongoose.connect(mongoUri);

  await upsertUser({
    email: process.env.SEED_ALODWY_EMAIL || 'mohammed.alodwy@seed.local',
    password,
    username: 'محمد العدوي',
    phone: '',
    role: 'user',
    isActive: true,
    features: DEFAULT_FEATURES,
    planType: 'limited',
    dailyLimitEnabled: true,
    maxDailyBookings: 30,
    maxMonthlyBookings: 800,
    allowPaidExtra: true,
    extraBookingPrice: 75,
    packageName: 'باقة 800',
    packagePriceSar: 3000,
    subscriptionEndsAt: new Date(endAlodwy)
  });

  await upsertUser({
    email: process.env.SEED_OPEN_MONTHLY_EMAIL || 'open.monthly@seed.local',
    password,
    username: 'باقة مفتوحة شهرية (مثال)',
    phone: '',
    role: 'user',
    isActive: true,
    features: DEFAULT_FEATURES,
    planType: 'open',
    dailyLimitEnabled: false,
    allowPaidExtra: false,
    extraBookingPrice: 0,
    packageName: 'باقة مفتوحة شهرية',
    packagePriceSar: Number.isFinite(openPrice) && openPrice >= 0 ? openPrice : 500,
    subscriptionEndsAt: new Date(endOpen)
  });
}

run()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('seedPackageExamples failed:', err.message);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });
