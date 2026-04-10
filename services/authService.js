const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../routes/models/User');
const bookingDailyLimits = require('./bookingDailyLimits');

const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
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
    features: [...bookingDailyLimits.DEFAULT_USER_FEATURES]
  });
  const otp = generateOtp();
  user.otp = otp;
  user.otpExpires = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return {
    user: {
      _id: user._id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
      isActive: user.isActive,
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
  const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return {
    user: {
      _id: refreshed._id,
      email: refreshed.email,
      phone: refreshed.phone,
      username: refreshed.username,
      emailVerified: refreshed.emailVerified,
      phoneVerified: refreshed.phoneVerified,
      isActive: refreshed.isActive,
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
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  const jwtToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return {
    user: { _id: user._id, email: user.email, phone: user.phone, username: user.username, isActive: user.isActive },
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
  const jwtToken = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  return {
    user: { _id: user._id, email: user.email, phone: user.phone, username: user.username, emailVerified: user.emailVerified, phoneVerified: user.phoneVerified, isActive: user.isActive },
    token: jwtToken
  };
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
    features
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
    features !== undefined;

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
        'email phone username isActive bookingCount transitBookingCount importBookingCount maxTransitBookingCount maxImportBookingCount lastBookingCountDay features emailVerified phoneVerified createdAt updatedAt'
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
      totalDailyBookings: bookingDailyLimits.totalDailyBookings(o),
      features: bookingDailyLimits.resolveFeaturesForApi(o)
    };
  });
  return { items: itemsOut, page: pageNum, limit: limitNum, total };
}

async function resetBookingCount(userId) {
  const today = bookingDailyLimits.utcYmd();
  const user = await User.findByIdAndUpdate(
    userId,
    {
      $set: {
        bookingCount: 0,
        transitBookingCount: 0,
        importBookingCount: 0,
        lastBookingCountDay: today
      }
    },
    { new: true }
  ).select(
    'email bookingCount transitBookingCount importBookingCount maxTransitBookingCount maxImportBookingCount lastBookingCountDay features'
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
  const today = bookingDailyLimits.utcYmd();
  const result = await User.updateMany(
    {},
    {
      $set: {
        bookingCount: 0,
        transitBookingCount: 0,
        importBookingCount: 0,
        lastBookingCountDay: today
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

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
  verifyOtp,
  resendOtp,
  activateUser,
  deactivateUser,
  updateUser,
  listUsers,
  resetBookingCount,
  resetAllBookingCounts,
  verifyToken,
  JWT_SECRET
};
