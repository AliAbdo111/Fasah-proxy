import { Request, Response, NextFunction } from 'express';
import * as authService from '../../services/authService';

export default async function adminAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = (req.headers['authorization'] || req.headers['x-auth-token']) as string;
    const { decoded, user } = await authService.assertAdminToken(token);
    (req as Request & { auth: Record<string, unknown>; adminUser: unknown }).auth = {
      ...(decoded as Record<string, unknown>),
      role: user.role
    };
    (req as Request & { adminUser: unknown }).adminUser = user;
    next();
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status || 401).json({ success: false, message: e.message || 'Unauthorized' });
  }
}
