import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import type { PrismaClient } from '@prisma/client';
import type { AssetService } from '../services/AssetService.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { HttpError } from '../lib/errors.js';
import { ALLOWED_MIMES, IMAGE_MAX_BYTES, renameAssetSchema } from '../schemas/asset.schema.js';
import { verifyAssetUrl } from '../lib/assetUrlSigner.js';
import { validate } from '../middleware/validate.js';

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if ((ALLOWED_MIMES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new HttpError(400, `Unsupported MIME type: ${file.mimetype}`));
    }
  },
});

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

  /**
   * GET /assets/:id/file?exp=&sig=
   * Streams asset bytes from GCS through the server. Auth: HMAC-signed URL only.
   *
   * Why no jwtAuth: <img> and new Image() can't send Authorization headers.
   * Capability-based access via short-lived signed URL is the standard pattern
   * (see assetUrlSigner). The URL is issued by JWT-authenticated GET /api/assets/:id.
   * Bucket stays fully private; the signature scopes access to one asset for 4h.
   */
  router.get('/:id/file', async (req: Request<{ id: string }>, res: Response) => {
    try {
      const exp = req.query['exp'] as string | undefined;
      const sig = req.query['sig'] as string | undefined;
      if (!verifyAssetUrl(req.params.id, exp, sig)) {
        throw new HttpError(403, 'Invalid or expired asset URL');
      }

      const { stream, mimeType, size } = await assetService.getAssetStream(req.params.id);

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', size);
      // Stable cache key (assetId+exp+sig identical on repeat) — safe to cache long.
      res.setHeader('Cache-Control', 'public, max-age=3600, immutable');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('Cross-Origin-Resource-Policy', 'same-site');

      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.destroy();
      });

      stream.pipe(res);
    } catch (err) {
      handleError(err, res);
    }
  });

  /**
   * PATCH /assets/:id
   * Renames an asset (display name only — storageKey is immutable).
   * RBAC: asset owner OR room GM may rename.
   */
  router.patch(
    '/:id',
    jwtAuth,
    validate(renameAssetSchema),
    async (req: Request<{ id: string }, object, { name: string }>, res: Response) => {
      try {
        const asset = await assetService.findById(req.params.id);
        if (!asset) throw new HttpError(404, 'Asset not found');

        const isOwner = asset.ownerId === req.user!.id;
        const room = await db.room.findUnique({
          where: { id: asset.roomId },
          select: { ownerId: true },
        });
        const isRoomGm = room?.ownerId === req.user!.id;
        if (!isOwner && !isRoomGm) {
          throw new HttpError(403, 'Only the asset owner or room GM may rename');
        }

        const updated = await assetService.rename(req.params.id, req.body.name);
        const dto = await assetService.getAssetDTO(updated.id);
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * POST /assets
   * Uploads a file directly through the server to GCS. No presigned URL exposed to the client.
   * RBAC: requester must be room owner or RoomMember.
   * Ф6.1, Ф7.2, НФВ 6.2.
   */
  router.post(
    '/',
    jwtAuth,
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        const roomId = req.body['roomId'] as string | undefined;
        if (!roomId) throw new HttpError(400, 'roomId is required');

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(roomId)) throw new HttpError(400, 'roomId must be a UUID');

        if (!req.file) throw new HttpError(400, 'file is required');

        await assertAssetListAccess(db, roomId, req.user!);

        // Multer decodes multipart filename as latin1 per RFC 7578 legacy default,
        // but browsers send UTF-8 bytes. Re-decode to recover Cyrillic/Unicode names.
        const rawName = req.file.originalname || 'upload';
        const originalName = Buffer.from(rawName, 'latin1').toString('utf8');

        const asset = await assetService.uploadUserFile(
          req.file.buffer,
          req.file.mimetype,
          req.user!.id,
          roomId,
          originalName,
        );

        const dto = await assetService.getAssetDTO(asset.id);
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
