import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { AssetService } from '../services/AssetService.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { validate } from '../middleware/validate.js';
import { HttpError } from '../lib/errors.js';
import { initUploadSchema, finalizeUploadSchema } from '../schemas/asset.schema.js';

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
}

const VALID_TYPES = new Set(['image', 'audio', 'pdf', 'all']);

async function assertAssetListAccess(
  db: PrismaClient,
  roomId: string,
  user: NonNullable<Request['user']>,
): Promise<void> {
  const room = await db.room.findUnique({ where: { id: roomId }, select: { ownerId: true } });
  if (!room) throw new HttpError(404, 'Room not found');
  if (room.ownerId === user.id) return;

  const [member, char] = await Promise.all([
    db.roomMember.findFirst({
      where: { roomId, userId: user.id },
      select: { id: true },
    }),
    db.character.findFirst({
      where: { roomId, ownerId: user.id },
      select: { id: true },
    }),
  ]);
  const boundObserver = user.role === 'Observer' && user.boundRoomId === roomId;
  if (!member && !char && !boundObserver) throw new HttpError(403, 'Not a room member');
}

export function buildAssetsRouter(assetService: AssetService, db: PrismaClient): IRouter {
  const router = Router();

  /**
   * GET /assets?roomId=<uuid>&type=image|audio|pdf|all
   * Lists assets for a room. RBAC: requester must be room owner or have a character.
   * Ф6.1, Ф7.2 — Додаток Г Г.1.
   */
  router.get('/', jwtAuth, async (req: Request, res: Response) => {
    try {
      const roomId = req.query['roomId'] as string | undefined;
      if (!roomId) throw new HttpError(400, 'roomId query param is required');

      const type = (req.query['type'] as string | undefined) ?? 'all';
      if (!VALID_TYPES.has(type)) throw new HttpError(400, 'type must be image|audio|pdf|all');

      await assertAssetListAccess(db, roomId, req.user!);

      const dtos = await assetService.listByRoomAndType(roomId, type);
      res.json(dtos);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/:id', jwtAuth, async (req: Request<{ id: string }>, res: Response) => {
    try {
      const dto = await assetService.getAssetDTO(req.params.id);
      res.json(dto);
    } catch (err) {
      handleError(err, res);
    }
  });

  router.get('/:id/file', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const dto = await assetService.getAssetDTO(req.params.id);
      res.redirect(dto.url);
    } catch (err) {
      handleError(err, res);
    }
  });

  /**
   * POST /assets/uploads
   * Initiates a presigned upload: returns a GCS signed PUT URL + storageKey.
   * RBAC: user must be room owner or RoomMember.
   * Ф6.1, НФВ 6.2 — Додаток Г Г.1.
   */
  router.post(
    '/uploads',
    jwtAuth,
    validate(initUploadSchema),
    async (req: Request, res: Response) => {
      try {
        const result = await assetService.initUpload(req.body, req.user!.id);
        res.status(200).json(result);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * POST /assets
   * Finalizes an upload: verifies the file in storage and creates Asset record.
   * RBAC: user must be room owner or RoomMember; storageKey must match roomId.
   * Ф6.1, Ф7.2.
   */
  router.post(
    '/',
    jwtAuth,
    validate(finalizeUploadSchema),
    async (req: Request, res: Response) => {
      try {
        const dto = await assetService.finalizeUpload(req.body, req.user!.id);
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
