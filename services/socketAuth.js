const authService = require('./authService');
const User = require('../routes/models/User');

function roomForUserId(userId) {
  return `user:${String(userId)}`;
}

function roomForEmail(email) {
  return `email:${String(email).toLowerCase().trim()}`;
}

/**
 * Bind socket to app user (JWT + optional userId/email check). Joins user + email rooms.
 * @returns {{ userId: string, email: string, role: string } | null}
 */
async function bindSocketUser(socket, { token, userId, email }) {
  const rawToken =
    (typeof token === 'string' && token.trim()) ||
    socket.handshake.auth?.token ||
    socket.handshake.headers?.['x-auth-token'];

  if (!rawToken) {
    return null;
  }

  let decoded;
  try {
    decoded = authService.verifyToken(rawToken);
  } catch {
    return null;
  }

  const user = await User.findById(decoded.userId).select('email isActive role passwordChangedAt');
  if (!user || !user.isActive) {
    return null;
  }

  if (user.passwordChangedAt && decoded.iat) {
    const tokenIssuedAtMs = decoded.iat * 1000;
    const changedAtMs = new Date(user.passwordChangedAt).getTime();
    if (Number.isFinite(changedAtMs) && tokenIssuedAtMs < changedAtMs) {
      return null;
    }
  }

  const boundUserId = String(user._id);

  if (userId != null && String(userId) !== boundUserId) {
    return null;
  }

  if (email != null && String(email).toLowerCase().trim() !== user.email) {
    return null;
  }

  const role = user.role === 'admin' ? 'admin' : 'user';
  const previousUserId = socket.data.userId;
  const previousEmail = socket.data.email;

  socket.data.userId = boundUserId;
  socket.data.email = user.email;
  socket.data.role = role;

  if (previousUserId && previousUserId !== boundUserId) {
    socket.leave(roomForUserId(previousUserId));
  }
  if (previousEmail && previousEmail !== user.email) {
    socket.leave(roomForEmail(previousEmail));
  }

  socket.join(roomForUserId(boundUserId));
  socket.join(roomForEmail(user.email));
  if (role === 'admin') {
    socket.join('role:admin');
  }

  return { userId: boundUserId, email: user.email, role };
}

/** Resolve user from handshake only (no DB) when JWT is valid — used before full bind. */
function peekTokenUserId(token) {
  try {
    const decoded = authService.verifyToken(token);
    return decoded.userId ? String(decoded.userId) : null;
  } catch {
    return null;
  }
}

module.exports = {
  bindSocketUser,
  peekTokenUserId,
  roomForUserId,
  roomForEmail
};
