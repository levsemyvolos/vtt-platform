import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { LoginRequest, RegisterRequest, RefreshRequest } from '@vtt/shared';
import jwt from 'jsonwebtoken';
import { AuthService } from '../services/AuthService.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { SessionRepository } from '../repositories/SessionRepository.js';
import { prisma } from '../lib/prisma.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { validate } from '../middleware/validate.js';
import { registerSchema, loginSchema } from '../schemas/auth.schema.js';
import { HttpError } from '../lib/errors.js';

const authService = new AuthService(
  new UserRepository(prisma),
  new SessionRepository(prisma),
);

export const authRouter: IRouter = Router();

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
  } else {
    res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
  }
}

authRouter.post(
  '/register',
  // R2-REG-002: validate before hitting bcrypt / Prisma to prevent DoS (200-char password)
  // and Prisma crashes (200-char name → VARCHAR overflow → 500).
  validate(registerSchema),
  async (req: Request<object, object, RegisterRequest>, res: Response) => {
    try {
      const { email, password, name } = req.body;
      const ua = String(req.headers['user-agent'] ?? '');
      // shared RegisterRequest uses `name`; AuthService expects displayName
      const result = await authService.register(email, password, name, ua);
      res.status(201).json(result);
    } catch (err) {
      handleError(err, res);
    }
  },
);

authRouter.post(
  '/login',
  // R2-REG-002: validate before hitting bcrypt to prevent DoS (200-char password).
  validate(loginSchema),
  async (req: Request<object, object, LoginRequest>, res: Response) => {
    try {
      const { email, password } = req.body;
      const ua = String(req.headers['user-agent'] ?? '');
      const result = await authService.login(email, password, ua);
      res.json(result);
    } catch (err) {
      handleError(err, res);
    }
  },
);

authRouter.post(
  '/refresh',
  async (req: Request<object, object, RefreshRequest>, res: Response) => {
    try {
      const { refreshToken } = req.body;
      const result = await authService.rotateRefresh(refreshToken);
      res.json(result);
    } catch (err) {
      handleError(err, res);
    }
  },
);

/**
 * POST /auth/logout — R2-BUG-006: lenient + idempotent logout.
 *
 * jwtAuth is intentionally NOT applied — an expired access token must still
 * succeed at clearing the server-side session so the refresh token cannot be
 * reused for 30 days. We decode (without verify) to extract the sessionId.
 *
 * Guarantees:
 *  - Returns 204 always (even on error) — client must always succeed logout.
 *  - Idempotent: repeated logout on same session returns 204.
 *  - Falls back to body.sessionId if Authorization header is absent / undecodable.
 */
authRouter.post('/logout', async (req: Request, res: Response) => {
  try {
    const sessionRepo = new SessionRepository(prisma);
    let sessionId: string | undefined;

    // 1. Try to extract sessionId from Authorization header (even if token is expired).
    const auth = req.headers['authorization'];
    if (auth?.startsWith('Bearer ')) {
      try {
        const token = auth.slice(7);
        const payload = jwt.decode(token) as { sid?: string } | null;
        if (payload?.sid) sessionId = payload.sid;
      } catch {
        // malformed JWT — ignore, try body fallback
      }
    }

    // 2. Body fallback: accept explicit sessionId (e.g. from client-side tokenStore).
    if (!sessionId) {
      const body = req.body as { sessionId?: string };
      if (body?.sessionId) sessionId = body.sessionId;
    }

    // 3. Delete the session — swallow "not found" so logout is idempotent.
    if (sessionId) {
      await sessionRepo.deleteById(sessionId).catch(() => { /* already gone */ });
    }

    res.status(204).send();
  } catch {
    // Safety net: even on unexpected error, client logout must succeed.
    res.status(204).send();
  }
});
