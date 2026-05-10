import type { RequestHandler } from 'express';
import type { Role } from '@vtt/shared';

/**
 * Returns middleware that allows only the specified roles.
 * MUST be chained after `jwtAuth` — `req.user` is assumed populated; if it is
 * absent the upstream `jwtAuth` already short-circuits with 401.
 * Implements RBAC matrix per §2.18.2.
 * @param allowedRoles one or more Role values that may proceed
 */
export const requireRole =
  (...allowedRoles: Role[]): RequestHandler =>
  (req, res, next) => {
    if (!allowedRoles.includes(req.user!.role)) {
      res.status(403).json({
        error: { code: 403, message: `Required role: ${allowedRoles.join(' | ')}` },
      });
      return;
    }
    next();
  };
