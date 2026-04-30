import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { LoginRequest, RegisterRequest, RefreshRequest } from '@vtt/shared';
import { AuthService } from '../services/AuthService.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { SessionRepository } from '../repositories/SessionRepository.js';
import { prisma } from '../lib/prisma.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
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

authRouter.post('/logout', jwtAuth, async (req: Request, res: Response) => {
  try {
    await authService.logout(req.user!.sessionId);
    res.status(204).send();
  } catch (err) {
    handleError(err, res);
  }
});
