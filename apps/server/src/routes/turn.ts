import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { TurnConfigResponse } from '@vtt/shared';
import { TurnConfigProvider } from '../services/TurnConfigProvider.js';
import { jwtAuth } from '../middleware/jwtAuth.js';

export function buildTurnRouter(provider: TurnConfigProvider): IRouter {
  const router: IRouter = Router();

  router.get('/turn-config', jwtAuth, (req: Request, res: Response<TurnConfigResponse>) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).end();
      return;
    }
    res.json(provider.getIceServers(userId));
  });

  return router;
}
