const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const bookingDailyLimits = require('../services/bookingDailyLimits');
const bookingHistoryService = require('../services/bookingHistoryService');

// POST /api/auth/register
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
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Login failed' });
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

// PATCH /api/auth/users/:userId/activate (protected)
router.patch('/users/:userId/activate', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
    const result = await authService.activateUser(req.params.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to activate user' });
  }
});

// PATCH /api/auth/users/:userId/deactivate (protected)
router.patch('/users/:userId/deactivate', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
    const result = await authService.deactivateUser(req.params.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to deactivate user' });
  }
});

// PATCH /api/auth/users/:userId (protected) - update user including password
router.patch('/users/:userId', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
    const result = await authService.updateUser(req.params.userId, req.body || {});
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to update user' });
  }
});

// PATCH /api/auth/users/:userId/password (protected) - set user password
router.patch('/users/:userId/password', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
    const { newPassword } = req.body || {};
    const result = await authService.setUserPassword(req.params.userId, newPassword);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to set user password' });
  }
});

// GET /api/auth/users (protected) - list users
router.get('/users', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
    const { page, limit, q } = req.query;
    const result = await authService.listUsers({ page, limit, q });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to list users' });
  }
});

// PATCH /api/auth/users/:userId/reset-booking-count (protected)
router.patch('/users/:userId/reset-booking-count', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
    const result = await authService.resetBookingCount(req.params.userId);
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to reset booking count' });
  }
});

// PATCH /api/auth/users/reset-booking-count/all (protected)
router.patch('/users/reset-booking-count/all', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
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
    const { page, limit, q } = req.query;
    const result = await bookingHistoryService.listUserBookings({
      userId: decoded.userId,
      page,
      limit,
      q
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to list my booking history' });
  }
});

// GET /api/auth/users/:userId/bookings/history (protected)
router.get('/users/:userId/bookings/history', async (req, res) => {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    authService.verifyToken(token);
    const { page, limit, q } = req.query;
    const result = await bookingHistoryService.listUserBookings({
      userId: req.params.userId,
      page,
      limit,
      q
    });
    res.json({ success: true, ...result });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ success: false, message: err.message || 'Failed to list user booking history' });
  }
});

module.exports = router;
