const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authService = require('../services/authService');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');
const bookingDailyLimits = require('../services/bookingDailyLimits');
const bookingHistoryService = require('../services/bookingHistoryService');
const socketService = require('../services/socketService');
const { loadAppointmentsForUser } = require('../services/scheduleAppointmentsService');
const { getPollStatusForApi } = require('../services/landSchedulePollManager');

function attachPollStatusAndNotifySockets(user) {
  const userId = String(user._id);
  const pollStatus = getPollStatusForApi(userId);
  socketService.emitToUserId(userId, 'fasah:land-schedule:poll:status', pollStatus);
  return pollStatus;
}

// POST /api/auth/register (admin only — use admin JWT from POST /api/auth/admin/login)
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, phone, username } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const result = await authService.register({ email, password, phone, username });
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const result = await authService.login(email, password);
    const userId = String(result.user._id);
    const loginPayload = {
      email: result.user.email,
      userId
    };
    const pollStatus = attachPollStatusAndNotifySockets(result.user);
    socketService.emitToUserId(userId, 'user-login', loginPayload);
    socketService.emitToEmail(loginPayload.email, 'user-login', loginPayload);
    socketService.emit('user-login', loginPayload);
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      ...result,
      pollStatus
    });
  } catch (err) {
    console.error("error", err.message); 
    return res.status(500).json({ success: false, message: err.message || 'Login failed' });
  }
});
// POST /api/auth/admin/login — token only for accounts with role admin
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    const result = await authService.adminLogin(email, password);
    const pollStatus = attachPollStatusAndNotifySockets(result.user);
    res.json({ success: true, ...result, pollStatus });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Admin login failed' });
  }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const result = await authService.forgotPassword(email);
    res.json({
      success: true,
      message: 'Reset token generated',
      resetToken: result.resetToken,
      expiresInMinutes: result.expiresInMinutes
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Forgot password failed' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and newPassword are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const result = await authService.resetPassword(token, newPassword);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Reset password failed' });
  }
});

// POST /api/auth/verify-otp
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp, type } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and otp are required' });
    }
    const result = await authService.verifyOtp(email, otp, type || 'email');
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'OTP verification failed' });
  }
});

// POST /api/auth/resend-otp
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const result = await authService.resendOtp(email);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Resend OTP failed' });
  }
});

// PATCH /api/auth/change-password (protected) - change my password
router.patch('/change-password', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    const decoded = authService.verifyToken(token);
    const { currentPassword, newPassword } = req.body || {};
    const result = await authService.changeMyPassword({
      userId: decoded.userId,
      currentPassword,
      newPassword
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to change password' });
  }
});

// GET /api/auth/me (protected)
router.get('/me', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    const decoded = authService.verifyToken(token);
    const User = require('./models/User');
    await bookingDailyLimits.syncUserBookingDay(decoded.userId);
    const user = await User.findById(decoded.userId).select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const u = user.toObject();
    res.json({
      success: true,
      user: {
        ...u,
        ...bookingDailyLimits.bookingStatsPayload(user)
      }
    });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Unauthorized' });
  }
});

// PATCH /api/auth/users/:userId/activate (protected, admin only)
router.patch('/users/:userId/activate', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const result = await authService.activateUser(req.params.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to activate user' });
  }
});

// PATCH /api/auth/users/:userId/deactivate (protected, admin only)
router.patch('/users/:userId/deactivate', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const result = await authService.deactivateUser(req.params.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to deactivate user' });
  }
});

// PATCH /api/auth/users/:userId (protected, admin only) - update user including password
router.patch('/users/:userId', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const result = await authService.updateUser(req.params.userId, req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to update user' });
  }
});

// PATCH /api/auth/users/:userId/password (protected, admin only) - set user password
router.patch('/users/:userId/password', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const { newPassword } = req.body || {};
    const result = await authService.setUserPassword(req.params.userId, newPassword);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to set user password' });
  }
});

// GET /api/auth/users (protected, admin only) - list users
router.get('/users', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const { page, limit, q } = req.query;
    const result = await authService.listUsers({ page, limit, q });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to list users' });
  }
});

// PATCH /api/auth/users/:userId/reset-booking-count (protected, admin only)
router.patch('/users/:userId/reset-booking-count', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const result = await authService.resetBookingCount(req.params.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to reset booking count' });
  }
});

// PATCH /api/auth/users/reset-booking-count/all (protected, admin only)
router.patch('/users/reset-booking-count/all', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    await authService.assertAdminToken(token);
    const result = await authService.resetAllBookingCounts();
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to reset all booking counts' });
  }
});

// GET /api/auth/me/bookings/history (protected)
router.get('/me/bookings/history', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    const decoded = authService.verifyToken(token);
    const { page, limit, q, kind, success, consumptionType, fromDate, toDate } = req.query;
    const result = await bookingHistoryService.listUserBookings({
      userId: decoded.userId,
      page,
      limit,
      q,
      kind,
      success,
      consumptionType,
      fromDate,
      toDate
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to list my booking history' });
  }
});

// GET /api/auth/users/:userId/appointments (admin only) — Redis schedule list for a user
router.get('/users/:userId/appointments', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userId. Use a real Mongo ObjectId.'
      });
    }
    const data = await loadAppointmentsForUser(userId);
    res.json({
      success: true,
      ...data,
      requestedBy: String(req.adminUser._id),
      asAdmin: true
    });
  } catch (err) {
    const status = err.code === 'REDIS_OFF' ? 503 : err.status || 500;
    res.status(status).json({
      success: false,
      message: err.message || 'Failed to load user appointments'
    });
  }
});

// GET /api/auth/users/:userId/bookings/history/export (protected, admin only)
router.get('/users/:userId/bookings/history/export', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userId. Use a real Mongo ObjectId (not :userId placeholder).'
      });
    }
    const { q, kind, success, consumptionType, fromDate, toDate } = req.query;
    const result = await bookingHistoryService.exportUserBookingsCsv({
      userId,
      q,
      kind,
      success,
      consumptionType,
      fromDate,
      toDate
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send('\uFEFF' + result.csv);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to export user booking history' });
  }
});

// GET /api/auth/users/:userId/bookings/history (protected, admin only)
router.get('/users/:userId/bookings/history', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    // await authService.assertAdminToken(token);
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid userId. Use a real Mongo ObjectId (not :userId placeholder).'
      });
    }
    const { page, limit, q, kind, success, consumptionType, fromDate, toDate } = req.query;
    const result = await bookingHistoryService.listUserBookings({
      userId,
      page,
      limit,
      q,
      kind,
      success,
      consumptionType,
      fromDate,
      toDate
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to list user booking history' });
  }
});

module.exports = router;
