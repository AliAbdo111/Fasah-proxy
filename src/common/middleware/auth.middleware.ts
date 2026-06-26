import { Request, Response, NextFunction } from 'express';
import * as authService from '../../services/authService';
import User from '../../schemas/user.schema';
import { extractAuthToken } from './request-auth';

/**
 * Protects routes: requires valid JWT and active user.
 */
export default async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'OPTIONS') {
    return next();
  }
  try {
    const token = extractAuthToken(req);
    const decoded = authService.verifyToken(token) as { userId: string; iat?: number };
    let user;
    try {
      user = await User.findById(decoded.userId).select(
        '-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires'
      );
    } catch (dbErr: unknown) {
      const msg = String((dbErr as Error).message || dbErr);
      if (
        msg.includes('not connected') ||
        msg.includes('buffering timed out') ||
        msg.includes('crypto is not defined')
      ) {
        return res.status(503).json({
          success: false,
          message: 'Database unavailable. Check MongoDB connection and server restart after crypto polyfill.'
        });
      }
      throw dbErr;
    }
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }

    if (user.passwordChangedAt && decoded.iat) {
      const tokenIssuedAtMs = decoded.iat * 1000;
      const changedAtMs = new Date(user.passwordChangedAt).getTime();
      if (Number.isFinite(changedAtMs) && tokenIssuedAtMs < changedAtMs) {
        return res.status(401).json({ success: false, message: 'Token expired (password changed). Please login again.' });
      }
    }

    (req as Request & { auth: unknown; user: unknown }).auth = {
      ...decoded,
      role: user.role === 'admin' ? 'admin' : 'user'
    };
    (req as Request & { user: unknown }).user = user;
    next();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 401).json({
      success: false,
      message: e.message || 'Unauthorized'
    });
  }
}
