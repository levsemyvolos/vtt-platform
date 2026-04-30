import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type {
  HandoutCreateRequest,
  HandoutGrantRequest,
} from '@vtt/shared';
import type { HandoutService } from '../services/HandoutService.js';
import type { HandoutRepository } from '../repositories/HandoutRepository.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { HttpError } from '../lib/errors.js';

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
}

/**
 * REST router for handouts (Ф7.2). RBAC is performed inside HandoutService;
 * this router only resolves the room scope for `:id`-style routes via the
 * repository (a handout's `roomId` is the source of truth).
 */
export function buildHandoutsRouter(
  handoutService: HandoutService,
  handoutRepo: HandoutRepository,
  roomRepo: RoomRepository,
): IRouter {
  const router = Router();

  router.get(
    '/rooms/:roomId/handouts',
    jwtAuth,
    async (req: Request<{ roomId: string }>, res: Response) => {
      try {
        const role = await roomRepo.getRoleInRoom(
          req.params.roomId,
          req.user!.id,
          req.user!.role,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const list = await handoutService.listForViewer(
          req.params.roomId,
          role,
          req.user!.id,
        );
        res.json(list);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/rooms/:roomId/handouts',
    jwtAuth,
    async (
      req: Request<{ roomId: string }, object, HandoutCreateRequest>,
      res: Response,
    ) => {
      try {
        const role = await roomRepo.getRoleInRoom(
          req.params.roomId,
          req.user!.id,
          req.user!.role,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const dto = await handoutService.createHandout(req.params.roomId, role, req.body);
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/handouts/:id/grant',
    jwtAuth,
    async (
      req: Request<{ id: string }, object, HandoutGrantRequest>,
      res: Response,
    ) => {
      try {
        const handout = await handoutRepo.findById(req.params.id);
        if (!handout) throw new HttpError(404, 'Handout not found');
        const role = await roomRepo.getRoleInRoom(
          handout.roomId,
          req.user!.id,
          req.user!.role,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const { userIds } = req.body;
        if (!Array.isArray(userIds) || userIds.some((u) => typeof u !== 'string')) {
          throw new HttpError(400, 'userIds must be string[]');
        }
        const dto = await handoutService.grantToPlayers(req.params.id, role, userIds);
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.delete(
    '/handouts/:id/recipients/:userId',
    jwtAuth,
    async (req: Request<{ id: string; userId: string }>, res: Response) => {
      try {
        const handout = await handoutRepo.findById(req.params.id);
        if (!handout) throw new HttpError(404, 'Handout not found');
        const role = await roomRepo.getRoleInRoom(
          handout.roomId,
          req.user!.id,
          req.user!.role,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const dto = await handoutService.revokeFromPlayer(
          req.params.id,
          role,
          req.params.userId,
        );
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.delete(
    '/handouts/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const handout = await handoutRepo.findById(req.params.id);
        if (!handout) throw new HttpError(404, 'Handout not found');
        const role = await roomRepo.getRoleInRoom(
          handout.roomId,
          req.user!.id,
          req.user!.role,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        await handoutService.deleteHandout(req.params.id, role);
        res.status(204).send();
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
