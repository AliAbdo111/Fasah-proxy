const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../routes/models/User');
const bookingDailyLimits = require('./bookingDailyLimits');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const ROLE_USER = 'user';
const ROLE_ADMIN = 'admin';

function resolveRole(userOrDoc) {
  if (!userOrDoc) return ROLE_USER;
  return userOrDoc.role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_USER;
}

function signUserToken(userId, role) {
  return jwt.sign(
    { userId: String(userId), role: role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_USER },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
const OTP_EXPIRY_MINUTES = 10;
const RESET_TOKEN_EXPIRY_MINUTES = 60;

function generateOtp(length = 6) {
  return crypto.randomInt(10 ** (length - 1), 10 ** length).toString();
}

function generateResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

async function register({ email, password, phone, username }) {
  const orConditions = [{ email }];
  if (username && username.trim()) orConditions.push({ username: username.trim() });
  const existing = await User.findOne({ $or: orConditions }).select('email username');
  if (existing) {
    if (existing.email === email) throw { status: 400, message: 'Email already registered' };
    if (username && existing.username === username.trim()) throw { status: 400, message: 'Username already taken' };
  }
  const user = await User.create({
    email,
    password,
    phone: phone || '',
    username: username || '',
    role: ROLE_USER,
    features: [...bookingDailyLimits.DEFAULT_USER_FEATURES]
  });
  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  const token = signUserToken(user._id, ROLE_USER);
  return {
    user: {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      isActive: user.isActive,
      role: resolveRole(user),
      ...bookingDailyLimits.bookingStatsPayload(user)
    },
    token,
    otpForVerification: otp
  };
}

async function login(email, password) {
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw { status: 401, message: 'Invalid email or password' };
  if (!user.isActive) throw { status: 403, message: 'Account is deactivated' };
  const valid = await user.comparePassword(password);
  if (!valid) throw { status: 401, message: 'Invalid email or password' };
  await bookingDailyLimits.syncUserBookingDay(user._id);
  const refreshed = await User.findById(user._id).select(
    '-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires'
  );
  const token = signUserToken(refreshed._id, resolveRole(refreshed));
  return {
    user: {
      _id: refreshed._id,
      email: refreshed.email,
      phone: refreshed.phone,
      username: refreshed.username,
      emailVerified: refreshed.emailVerified,
      phoneVerified: refreshed.phoneVerified,
      isActive: refreshed.isActive,
      role: resolveRole(refreshed),
      ...bookingDailyLimits.bookingStatsPayload(refreshed)
    },
    token
  };
}

/** Same as login but only accounts with role admin receive a token (403 otherwise). */
async function adminLogin(email, password) {
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw { status: 401, message: 'Invalid email or password' };
  if (!user.isActive) throw { status: 403, message: 'Account is deactivated' };
  const valid = await user.comparePassword(password);
  if (!valid) throw { status: 401, message: 'Invalid email or password' };
  // if (resolveRole(user) !== ROLE_ADMIN) {
  //   throw { status: 403, message: 'Admin access only' };
  // }
  await bookingDailyLimits.syncUserBookingDay(user._id);
  const refreshed = await User.findById(user._id).select(
    '-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires'
  );
  const token = signUserToken(refreshed._id, ROLE_ADMIN);
  return {
    user: {
      _id: refreshed._id,
      email: refreshed.email,
      phone: refreshed.phone,
      username: refreshed.username,
      emailVerified: refreshed.emailVerified,
      phoneVerified: refreshed.phoneVerified,
      isActive: refreshed.isActive,
      role: ROLE_ADMIN,
      ...bookingDailyLimits.bookingStatsPayload(refreshed)
    },
    token
  };
}

async function forgotPassword(email) {
  const user = await User.findOne({ email }).select('+resetPasswordToken +resetPasswordExpires');
  if (!user) throw { status: 404, message: 'No account found with this email' };
  const resetToken = generateResetToken();
  user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  return { resetToken, expiresInMinutes: RESET_TOKEN_EXPIRY_MINUTES };
}

async function resetPassword(token, newPassword) {
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpires: { $gt: Date.now() }
  }).select('+password +resetPasswordToken +resetPasswordExpires');
  if (!user) throw { status: 400, message: 'Invalid or expired reset token' };
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  const jwtToken = signUserToken(user._id, resolveRole(user));
  return {
    user: {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      isActive: user.isActive,
      role: resolveRole(user)
    },
    token: jwtToken
  };
}

async function verifyOtp(email, otp, type = 'email') {
  const user = await User.findOne({ email }).select('+otp +otpExpires');
  if (!user) throw { status: 404, message: 'User not found' };
  if (!user.otp || user.otp !== otp) throw { status: 400, message: 'Invalid OTP' };
  if (user.otpExpires < new Date()) throw { status: 400, message: 'OTP expired' };
  if (type === 'email') user.emailVerified = true;
  if (type === 'phone') user.phoneVerified = true;
  user.otp = undefined;
  user.otpExpires = undefined;
  await user.save({ validateBeforeSave: false });
  const jwtToken = signUserToken(user._id, resolveRole(user));
  return {
    user: {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      isActive: user.isActive,
      role: resolveRole(user)
    },
    token: jwtToken
  };
}

async function changeMyPassword({ userId, currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw { status: 404, message: 'User not found' };
  if (!user.isActive) throw { status: 403, message: 'Account is deactivated' };
  if (!currentPassword || !newPassword) throw { status: 400, message: 'currentPassword and newPassword are required' };
  if (String(newPassword).length < 6) throw { status: 400, message: 'Password must be at least 6 characters' };
  const ok = await user.comparePassword(String(currentPassword));
  if (!ok) throw { status: 400, message: 'Current password is incorrect' };
  user.password = String(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  return { message: 'Password updated' };
}

async function setUserPassword(userId, newPassword) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw { status: 404, message: 'User not found' };
  if (!newPassword) throw { status: 400, message: 'newPassword is required' };
  if (String(newPassword).length < 6) throw { status: 400, message: 'Password must be at least 6 characters' };
  user.password = String(newPassword);
  user.passwordChangedAt = new Date();
  await user.save();
  return { user: { _id: user._id, email: user.email }, message: 'Password updated' };
}

async function activateUser(userId) {
  const user = await User.findByIdAndUpdate(userId, { isActive: true }, { new: true });
  if (!user) throw { status: 404, message: 'User not found' };
  return { user: { _id: user._id, email: user.email, isActive: user.isActive } };
}

async function deactivateUser(userId) {
  const user = await User.findByIdAndUpdate(userId, { isActive: false }, { new: true });
  if (!user) throw { status: 404, message: 'User not found' };
  return { user: { _id: user._id, email: user.email, isActive: user.isActive } };
}

async function updateUser(userId, payload = {}) {
  const user = await User.findById(userId);
  if (!user) throw { status: 404, message: 'User not found' };

  const {
    email,
    password,
    phone,
    username,
    isActive,
    emailVerified,
    phoneVerified,
    maxTransitBookingCount,
    maxImportBookingCount,
    features,
    role,
    planType,
    dailyLimitEnabled,
    maxDailyBookings,
    maxMonthlyBookings,
    allowPaidExtra,
    extraBookingPrice,
    packageName,
    packagePriceSar,
    subscriptionEndsAt,
    proxyEnabled,
    proxies
  } = payload;

  const hasAnyField =
    email !== undefined ||
    password !== undefined ||
    phone !== undefined ||
    username !== undefined ||
    isActive !== undefined ||
    emailVerified !== undefined ||
    phoneVerified !== undefined ||
    maxTransitBookingCount !== undefined ||
    maxImportBookingCount !== undefined ||
    features !== undefined ||
    role !== undefined ||
    planType !== undefined ||
    dailyLimitEnabled !== undefined ||
    maxDailyBookings !== undefined ||
    maxMonthlyBookings !== undefined ||
    allowPaidExtra !== undefined ||
    extraBookingPrice !== undefined ||
    packageName !== undefined ||
    packagePriceSar !== undefined ||
    subscriptionEndsAt !== undefined ||
    proxyEnabled !== undefined ||
    proxies !== undefined;

  if (!hasAnyField) {
    throw { status: 400, message: 'No fields provided to update' };
  }

  if (email !== undefined) {
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!normalizedEmail) throw { status: 400, message: 'Email cannot be empty' };
    const existingEmail = await User.findOne({ email: normalizedEmail, _id: { $ne: userId } }).select('_id');
    if (existingEmail) throw { status: 400, message: 'Email already registered' };
    user.email = normalizedEmail;
  }

  if (username !== undefined) {
    const normalizedUsername = String(username).trim();
    if (normalizedUsername) {
      const existingUsername = await User.findOne({ username: normalizedUsername, _id: { $ne: userId } }).select('_id');
      if (existingUsername) throw { status: 400, message: 'Username already taken' };
    }
    user.username = normalizedUsername;
  }

  if (phone !== undefined) user.phone = String(phone).trim();
  if (isActive !== undefined) user.isActive = Boolean(isActive);
  if (emailVerified !== undefined) user.emailVerified = Boolean(emailVerified);
  if (phoneVerified !== undefined) user.phoneVerified = Boolean(phoneVerified);

  if (password !== undefined) {
    if (String(password).length < 6) throw { status: 400, message: 'Password must be at least 6 characters' };
    user.password = String(password);
  }

  if (maxTransitBookingCount !== undefined) {
    const n = Number(maxTransitBookingCount);
    if (!Number.isFinite(n) || n < 0) throw { status: 400, message: 'maxTransitBookingCount must be a non-negative number' };
    user.maxTransitBookingCount = n;
  }
  if (maxImportBookingCount !== undefined) {
    const n = Number(maxImportBookingCount);
    if (!Number.isFinite(n) || n < 0) throw { status: 400, message: 'maxImportBookingCount must be a non-negative number' };
    user.maxImportBookingCount = n;
  }

  if (features !== undefined) {
    if (!Array.isArray(features)) throw { status: 400, message: 'features must be an array of strings' };
    user.features = features.map((x) => String(x).trim()).filter(Boolean);
  }

  if (role !== undefined) {
    const r = String(role).trim();
    if (r !== ROLE_USER && r !== ROLE_ADMIN) throw { status: 400, message: 'role must be user or admin' };
    user.role = r;
  }

  if (planType !== undefined) {
    const v = String(planType).trim();
    if (!['limited', 'monthly_only', 'open'].includes(v)) {
      throw { status: 400, message: 'planType must be limited, monthly_only, or open' };
    }
    user.planType = v;
  }

  if (dailyLimitEnabled !== undefined) user.dailyLimitEnabled = Boolean(dailyLimitEnabled);

  if (maxDailyBookings !== undefined) {
    const n = Number(maxDailyBookings);
    if (!Number.isFinite(n) || n < 0) throw { status: 400, message: 'maxDailyBookings must be a non-negative number' };
    user.maxDailyBookings = n;
  }

  if (maxMonthlyBookings !== undefined) {
    const n = Number(maxMonthlyBookings);
    if (!Number.isFinite(n) || n < 0) throw { status: 400, message: 'maxMonthlyBookings must be a non-negative number' };
    user.maxMonthlyBookings = n;
  }

  if (allowPaidExtra !== undefined) user.allowPaidExtra = Boolean(allowPaidExtra);

  if (extraBookingPrice !== undefined) {
    const n = Number(extraBookingPrice);
    if (!Number.isFinite(n) || n < 0) throw { status: 400, message: 'extraBookingPrice must be a non-negative number' };
    user.extraBookingPrice = n;
  }

  if (Boolean(user.allowPaidExtra) && Number(user.extraBookingPrice || 0) < 0) {
    throw { status: 400, message: 'extraBookingPrice must be >= 0 when allowPaidExtra is enabled' };
  }

  if (packageName !== undefined) {
    user.packageName = String(packageName).trim();
  }
  if (packagePriceSar !== undefined) {
    const n = Number(packagePriceSar);
    if (!Number.isFinite(n) || n < 0) throw { status: 400, message: 'packagePriceSar must be a non-negative number' };
    user.packagePriceSar = n;
  }
  if (subscriptionEndsAt !== undefined) {
    if (subscriptionEndsAt === null || subscriptionEndsAt === '') {
      user.subscriptionEndsAt = null;
    } else {
      const d = new Date(subscriptionEndsAt);
      if (Number.isNaN(d.getTime())) throw { status: 400, message: 'subscriptionEndsAt must be a valid date or null' };
      user.subscriptionEndsAt = d;
    }
  }

  if (proxyEnabled !== undefined) {
    if (proxyEnabled === null || proxyEnabled === '') user.proxyEnabled = null;
    else user.proxyEnabled = Boolean(proxyEnabled);
  }

  if (proxies !== undefined) {
    if (!Array.isArray(proxies)) throw { status: 400, message: 'proxies must be an array' };
    user.proxies = proxies
      .map((p) => ({
        host: String((p && p.host) || '').trim(),
        port: Number((p && p.port) || 0),
        username: String((p && p.username) || '').trim(),
        password: String((p && p.password) || '').trim(),
        protocol: String((p && p.protocol) || 'http').toLowerCase() === 'https' ? 'https' : 'http',
        rejectUnauthorized: Boolean(p && p.rejectUnauthorized)
      }))
      .filter((p) => p.host && Number.isFinite(p.port) && p.port > 0 && p.port <= 65535);
  }

  await user.save();

  return {
    user: {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      role: resolveRole(user),
      proxyEnabled: user.proxyEnabled,
      proxies: Array.isArray(user.proxies) ? user.proxies : [],
      ...bookingDailyLimits.bookingStatsPayload(user)
    }
  };
}

async function listUsers({ page = 1, limit = 20, q = '' } = {}) {
  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 200);
  const filter = {};
  if (q && String(q).trim()) {
    const needle = String(q).trim();
    filter.$or = [
      { email: { $regex: needle, $options: 'i' } },
      { username: { $regex: needle, $options: 'i' } },
      { phone: { $regex: needle, $options: 'i' } }
    ];
  }
  const [items, total] = await Promise.all([
    User.find(filter)
      .select(
        'email phone username role isActive bookingCount transitBookingCount importBookingCount totalMonthlyTransitBookingCount totalMonthlyImportBookingCount maxTransitBookingCount maxImportBookingCount lastBookingCountDay lastBookingCountMonth features emailVerified phoneVerified planType dailyLimitEnabled maxDailyBookings maxMonthlyBookings allowPaidExtra extraBookingPrice paidExtraBookingsCount paidExtraAmount packageName packagePriceSar subscriptionEndsAt createdAt updatedAt'
        + ' proxyEnabled proxies'
      )
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum),
    User.countDocuments(filter)
  ]);
  const itemsOut = items.map((doc) => {
    const o = doc.toObject();
    return {
      ...o,
      ...bookingDailyLimits.bookingStatsPayload(o)
    };
  });
  return { items: itemsOut, page: pageNum, limit: limitNum, total };
}

async function resetBookingCount(userId) {
  const today = bookingDailyLimits.bookingDayYmd();
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        bookingCount: 0,
        transitBookingCount: 0,
        importBookingCount: 0,
        totalMonthlyTransitBookingCount: 0,
        totalMonthlyImportBookingCount: 0,
        paidExtraBookingsCount: 0,
        paidExtraAmount: 0,
        lastBookingCountDay: today,
        lastBookingCountMonth: bookingDailyLimits.bookingDayYm()
      }
    },
    { new: true }
  ).select(
    'email role bookingCount transitBookingCount importBookingCount totalMonthlyTransitBookingCount totalMonthlyImportBookingCount maxTransitBookingCount maxImportBookingCount lastBookingCountDay lastBookingCountMonth features planType dailyLimitEnabled maxDailyBookings maxMonthlyBookings allowPaidExtra extraBookingPrice paidExtraBookingsCount paidExtraAmount proxyEnabled proxies'
  );
  if (!user) throw { status: 404, message: 'User not found' };
  return {
    user: {
      _id: user._id,
      email: user.email,
      ...bookingDailyLimits.bookingStatsPayload(user)
    }
  };
}

async function resetAllBookingCounts() {
  const today = bookingDailyLimits.bookingDayYmd();
  const result = await User.updateMany(
    {},
    {
      $set: {
        bookingCount: 0,
        transitBookingCount: 0,
        importBookingCount: 0,
        totalMonthlyTransitBookingCount: 0,
        totalMonthlyImportBookingCount: 0,
        paidExtraBookingsCount: 0,
        paidExtraAmount: 0,
        lastBookingCountDay: today,
        lastBookingCountMonth: bookingDailyLimits.bookingDayYm()
      }
    }
  );
  return { matched: result.matchedCount ?? result.n ?? 0, modified: result.modifiedCount ?? result.nModified ?? 0 };
}

async function resendOtp(email) {
  const user = await User.findOne({ email }).select('+otp +otpExpires');
  if (!user) throw { status: 404, message: 'User not found' };
  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  return { otpForVerification: otp, expiresInMinutes: OTP_EXPIRY_MINUTES };
}

function verifyToken(bearerToken) {
  const token = bearerToken && bearerToken.replace(/^Bearer\s+/i, '');
  if (!token) throw { status: 401, message: 'Token required' };
  return jwt.verify(token, JWT_SECRET);
}

/** Validates JWT and that the user is active, still valid after password change, and role admin. */
async function assertAdminToken(bearerToken) {
  const decoded = verifyToken(bearerToken);
  const user = await User.findById(decoded.userId).select('isActive role passwordChangedAt');
  if (!user) throw { status: 401, message: 'User not found' };
  if (!user.isActive) throw { status: 403, message: 'Account is deactivated' };
  if (user.passwordChangedAt && decoded.iat) {
    const tokenIssuedAtMs = decoded.iat * 1000;
    const changedAtMs = new Date(user.passwordChangedAt).getTime();
    if (Number.isFinite(changedAtMs) && tokenIssuedAtMs < changedAtMs) {
      throw { status: 401, message: 'Token expired (password changed). Please login again.' };
    }
  }
  if (resolveRole(user) !== ROLE_ADMIN) {
    throw { status: 403, message: 'Admin role required' };
  }
  return { decoded, user };
}

module.exports = {
  ROLE_USER,
  ROLE_ADMIN,
  register,
  login,
  adminLogin,
  forgotPassword,
  resetPassword,
  verifyOtp,
  resendOtp,
  changeMyPassword,
  setUserPassword,
  activateUser,
  deactivateUser,
  updateUser,
  listUsers,
  resetBookingCount,
  resetAllBookingCounts,
  verifyToken,
  assertAdminToken,
  JWT_SECRET
};
