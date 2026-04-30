import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { AssetService } from '../services/AssetService.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { HttpError } from '../lib/errors.js';

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
}

export function buildAssetsRouter(assetService: AssetService): IRouter {
  const router = Router();

  router.get('/:id', jwtAuth, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const dto = await assetService.getAssetDTO(req.params.id);
      res.json(dto);
    } catch (err) {
      handleError(err, res);
    }
  });

  return router;
}
