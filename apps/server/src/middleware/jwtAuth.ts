import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@vtt/shared';

// Module augmentation for Express Request — namespace is the documented form
// for declaration merging with @types/express, which itself uses `namespace`.
// eslint-disable-next-line @typescript-eslint/no-namespace
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
        sessionId: string;
        /** Present only when role === 'Observer' — the room UUID the observer is bound to. */
        boundRoomId?: string;
      };
    }
  }
}

interface AccessPayload {
  sub: string;
  role: Role;
  sid: string;
  /** Observer only — room UUID scope-binding. */
  boundRoomId?: string;
}

const JWT_SECRET = process.env['JWT_SECRET'] ?? '';

/**
 * Verifies Bearer JWT in Authorization header and attaches req.user.
 * Returns 401 if token is missing, malformed, or expired.
 */
export const jwtAuth: RequestHandler = (req, res, next) => {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    res
      .status(401)
      .json({ error: { code: 401, message: 'Missing or malformed Authorization header' } });
    return;
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AccessPayload;
    req.user = {
      id: payload.sub,
      role: payload.role,
      sessionId: payload.sid,
      ...(payload.boundRoomId !== undefined ? { boundRoomId: payload.boundRoomId } : {}),
    };
    next();
  } catch {
    res
      .status(401)
      .json({ error: { code: 401, message: 'Invalid or expired access token' } });
  }
};
