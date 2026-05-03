import type { RequestHandler } from 'express';

/**
 * Middleware that enforces Observer room-scope binding (§2.18 RBAC).
 *
 * Rules:
 * - If req.user.role !== 'Observer' → pass through (GM/Player have no scope restriction).
 * - If req.user.role === 'Observer' → req.user.boundRoomId must equal req.params.id.
 *   Any mismatch returns 403 FORBIDDEN.
 *
 * Must be used after jwtAuth.
 * Designed for routes with :id param that maps to a room UUID.
 */
export const requireBoundRoom: RequestHandler<{ id?: string }> = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: { code: 401, message: 'Unauthenticated' } });
    return;
  }
  if (req.user.role !== 'Observer') {
    // GM / Player — no bound-room restriction
    next();
    return;
  }
  const roomId = req.params?.id;
  if (!roomId || req.user.boundRoomId !== roomId) {
    res.status(403).json({
      error: { code: 403, message: 'Observer access restricted to bound room' },
    });
    return;
  }
  next();
};
