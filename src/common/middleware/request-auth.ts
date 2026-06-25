import { Request } from 'express';

/**
 * App JWT from x-auth-token or Authorization: Bearer …
 */
export function extractAuthToken(req: Request): string {
  const raw = (req.headers['x-auth-token'] || req.headers['authorization'] || '') as string;
  if (!raw) return '';
  return String(raw).trim().replace(/^Bearer\s+/i, '').trim();
}

export function resolveRequestUserId(req: Request & { user?: { _id?: unknown }; auth?: { userId?: string } }): string | null {
  const id = req.user?._id || req.auth?.userId;
  return id ? String(id) : null;
}

export function requireRequestUserId(
  req: Request & { user?: { _id?: unknown }; auth?: { userId?: string } },
  res: { status: (n: number) => { json: (b: unknown) => void } }
): string | null {
  const userId = resolveRequestUserId(req);
  if (!userId) {
    res.status(401).json({
      success: false,
      message: 'Login required. Send app JWT via x-auth-token header or Authorization: Bearer <token>'
    });
    return null;
  }
  return userId;
}
