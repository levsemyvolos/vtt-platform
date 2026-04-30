import type { RequestHandler } from 'express';
import type { Role } from '@vtt/shared';

/**
 * Returns middleware that allows only the specified roles.
 * Must be used after jwtAuth.
 * Implements RBAC matrix per §2.15/§2.18.
 * @param allowedRoles one or more Role values that may proceed
 */
export const requireRole =
  (...allowedRoles: Role[]): RequestHandler =>
  (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: { code: 401, message: 'Unauthenticated' } });
      return;
    }
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: { code: 403, message: `Required role: ${allowedRoles.join(' | ')}` },
      });
      return;
    }
    next();
  };
