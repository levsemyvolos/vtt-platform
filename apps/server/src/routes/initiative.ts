import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type {
  InitiativeAddRequest,
  InitiativeReorderRequest,
  InitiativeUpdateRequest,
} from '@vtt/shared';
import type { InitiativeService } from '../services/InitiativeService.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';
import type { TypedServer } from '../socketio/types.js';
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
 * Validates and normalises an `InitiativeUpdateRequest` body.
 * Returns a clean patch object with only the defined fields.
 * @throws HttpError 400 on invalid field values
 */
function validateEntryPatch(body: InitiativeUpdateRequest): { name?: string; initiative?: number } {
  const { name, initiative } = body;
  if (name !== undefined && (typeof name !== 'string' || name.length < 1 || name.length > 64)) {
    throw new HttpError(400, 'name must be 1-64 characters');
  }
  if (initiative !== undefined && (typeof initiative !== 'number' || !Number.isInteger(initiative))) {
    throw new HttpError(400, 'initiative must be an integer');
  }
  const patch: { name?: string; initiative?: number } = {};
  if (name !== undefined) patch.name = name;
  if (initiative !== undefined) patch.initiative = initiative;
  return patch;
}

/**
 * REST router for the initiative tracker (Ф7.3).
 *
 * RBAC:
 *   - GET  : any room member (resolved via RoomRepository.getRoleInRoom).
 *   - POST/DELETE/reorder/advance : GM only.
 *
 * Side-effect: every successful write broadcasts the snapshot via
 * `io.to(roomId).emit('initiative:updated', payload)`.
 */
export function buildInitiativeRouter(
  initService: InitiativeService,
  roomRepo: RoomRepository,
  io: TypedServer,
): IRouter {
  const router = Router();

  async function requireGmForScene(
    sceneId: string,
    userId: string,
    jwtRole: 'GM' | 'Player' | 'Observer',
    boundRoomId?: string,
  ): Promise<{ roomId: string }> {
    const roomId = await initService.getRoomIdForScene(sceneId);
    const role = await roomRepo.getRoleInRoom(roomId, userId, jwtRole, boundRoomId);
    if (role !== 'GM') {
      throw new HttpError(403, 'Only GM can mutate initiative');
    }
    return { roomId };
  }

  async function requireMemberForScene(
    sceneId: string,
    userId: string,
    jwtRole: 'GM' | 'Player' | 'Observer',
    boundRoomId?: string,
  ): Promise<{ roomId: string }> {
    const roomId = await initService.getRoomIdForScene(sceneId);
    const role = await roomRepo.getRoleInRoom(roomId, userId, jwtRole, boundRoomId);
    if (!role) throw new HttpError(404, 'Room not found');
    return { roomId };
  }

  router.get(
    '/scenes/:sceneId/initiative',
    jwtAuth,
    async (req: Request<{ sceneId: string }>, res: Response) => {
      try {
        await requireMemberForScene(
          req.params.sceneId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        const snapshot = await initService.getSnapshot(req.params.sceneId);
        res.json(snapshot);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/scenes/:sceneId/initiative',
    jwtAuth,
    async (
      req: Request<{ sceneId: string }, object, InitiativeAddRequest>,
      res: Response,
    ) => {
      try {
        const { roomId } = await requireGmForScene(
          req.params.sceneId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        const { name, initiative, tokenId } = req.body;
        if (typeof name !== 'string' || typeof initiative !== 'number') {
          throw new HttpError(400, 'name (string) and initiative (number) are required');
        }
        if (tokenId !== undefined && typeof tokenId !== 'string') {
          throw new HttpError(400, 'tokenId must be a string');
        }
        const snapshot = await initService.addEntry(req.params.sceneId, name, initiative, tokenId);
        io.to(roomId).emit('initiative:updated', {
          sceneId: req.params.sceneId,
          entries: snapshot.entries,
          currentRound: snapshot.currentRound,
        });
        res.status(201).json(snapshot);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.delete(
    '/scenes/:sceneId/initiative/:entryId',
    jwtAuth,
    async (req: Request<{ sceneId: string; entryId: string }>, res: Response) => {
      try {
        const { roomId } = await requireGmForScene(
          req.params.sceneId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        const snapshot = await initService.removeEntry(
          req.params.sceneId,
          req.params.entryId,
        );
        io.to(roomId).emit('initiative:updated', {
          sceneId: req.params.sceneId,
          entries: snapshot.entries,
          currentRound: snapshot.currentRound,
        });
        res.json(snapshot);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/scenes/:sceneId/initiative/reorder',
    jwtAuth,
    async (
      req: Request<{ sceneId: string }, object, InitiativeReorderRequest>,
      res: Response,
    ) => {
      try {
        const { roomId } = await requireGmForScene(
          req.params.sceneId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        const { orderedIds } = req.body;
        if (!Array.isArray(orderedIds) || orderedIds.some((x) => typeof x !== 'string')) {
          throw new HttpError(400, 'orderedIds must be string[]');
        }
        const snapshot = await initService.reorder(req.params.sceneId, orderedIds);
        io.to(roomId).emit('initiative:updated', {
          sceneId: req.params.sceneId,
          entries: snapshot.entries,
          currentRound: snapshot.currentRound,
        });
        res.json(snapshot);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.patch(
    '/initiative/:entryId',
    jwtAuth,
    async (
      req: Request<{ entryId: string }, object, InitiativeUpdateRequest>,
      res: Response,
    ) => {
      try {
        const patch = validateEntryPatch(req.body);
        const sceneId = await initService.getSceneIdForEntry(req.params.entryId);
        const { roomId } = await requireGmForScene(sceneId, req.user!.id, req.user!.role, req.user!.boundRoomId);
        const snapshot = await initService.updateEntry(req.params.entryId, patch);
        io.to(roomId).emit('initiative:updated', {
          sceneId,
          entries: snapshot.entries,
          currentRound: snapshot.currentRound,
        });
        res.json({ ok: true });
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/scenes/:sceneId/initiative/advance',
    jwtAuth,
    async (req: Request<{ sceneId: string }>, res: Response) => {
      try {
        const { roomId } = await requireGmForScene(
          req.params.sceneId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        const snapshot = await initService.advanceTurn(req.params.sceneId);
        io.to(roomId).emit('initiative:updated', {
          sceneId: req.params.sceneId,
          entries: snapshot.entries,
          currentRound: snapshot.currentRound,
        });
        res.json(snapshot);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
