const authService = require('../services/authService');

/**
 * Requires a valid JWT and an account with role admin (same checks as assertAdminToken).
 * Accepts Authorization: Bearer … or x-auth-token (aligned with /api/auth routes).
 */
async function adminAuthMiddleware(req, res, next) {
  try {
    const token = req.headers['authorization'] || req.headers['x-auth-token'];
    const { decoded, user } = await authService.assertAdminToken(token);
    req.auth = { ...decoded, role: user.role };
    req.adminUser = user;
    next();
  } catch (err) {
    const status = err.status || 401;
    res.status(status).json({ success: false, message: err.message || 'Unauthorized' });
  }
}

module.exports = adminAuthMiddleware;
