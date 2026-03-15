const authService = require('../services/authService');
const User = require('../routes/models/User');

/**
 * Protects routes: requires valid JWT and active user.
 * Sets req.user and req.auth (decoded token).
 */
async function authMiddleware(req, res, next) {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    const decoded = authService.verifyToken(token);
    const user = await User.findById(decoded.userId).select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }
    req.auth = decoded;
    req.user = user;
    next();
  } catch (err) {
    const status = err.status || 401;
    res.status(status).json({
      success: false,
      message: err.message || 'Unauthorized'
    });
  }
}

module.exports = authMiddleware;
