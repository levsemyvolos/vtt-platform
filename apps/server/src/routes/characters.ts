import { Router, type IRouter } from 'express';
import express from 'express';
import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import type {
  CharacterCreateRequest,
  CharacterUpdateRequest,
} from '@vtt/shared';
import type { CharacterService } from '../services/CharacterService.js';
import type { CharacterRepository } from '../repositories/CharacterRepository.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { validate } from '../middleware/validate.js';
import { characterCreateSchema, characterUpdateSchema } from '../schemas/character.schema.js';
import { HttpError } from '../lib/errors.js';

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
}

/**
 * Broadcasts a character:created or character:updated event to all sockets
 * in the room, projecting the character per-viewer (RBAC A6).
 */
async function broadcastCharacterUpsert(
  io: Server,
  roomId: string,
  characterId: string,
  characterService: CharacterService,
  characterRepo: CharacterRepository,
  event: 'character:created' | 'character:updated',
): Promise<void> {
  const raw = await characterRepo.findById(characterId);
  if (!raw) return;
  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    const viewerRole = s.data.role;
    const viewerId = s.data.userId;
    if (!viewerRole || !viewerId) continue;
    const projected = await characterService.projectForViewer(raw, viewerRole, viewerId);
    s.emit(event, { roomId, character: projected });
  }
}

/**
 * REST router for character sheets (Ф9.1 — Ф9.3).
 *
 * RBAC is enforced by CharacterService (algorithm A6). The router only
 * resolves the room scope so that `viewerRole` reflects the per-room
 * effective role (GM-of-this-room is not the same as the JWT role).
 *
 * PDF upload uses `express.raw` instead of multer to avoid adding a new
 * dependency for a single endpoint. Limit: 20 MiB.
 *
 * `io` is optional — when null (test environment) broadcasts are skipped.
 */
export function buildCharactersRouter(
  characterService: CharacterService,
  characterRepo: CharacterRepository,
  roomRepo: RoomRepository,
  io: Server | null,
): IRouter {
  const router = Router();

  router.get(
    '/rooms/:roomId/characters',
    jwtAuth,
    async (req: Request<{ roomId: string }>, res: Response) => {
      try {
        const role = await roomRepo.getRoleInRoom(
          req.params.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const list = await characterService.listForViewer(
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
    '/rooms/:roomId/characters',
    jwtAuth,
    validate(characterCreateSchema),
    async (
      req: Request<{ roomId: string }, object, CharacterCreateRequest>,
      res: Response,
    ) => {
      try {
        const role = await roomRepo.getRoleInRoom(
          req.params.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        if (role === 'Observer') {
          throw new HttpError(403, 'Observers cannot create characters');
        }
        const dto = await characterService.create(
          req.params.roomId,
          req.user!.id,
          req.body,
        );
        res.status(201).json(dto);
        // Broadcast after response so the HTTP caller gets immediate feedback.
        if (io) {
          await broadcastCharacterUpsert(
            io,
            req.params.roomId,
            dto.id,
            characterService,
            characterRepo,
            'character:created',
          );
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.get(
    '/characters/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const existing = await characterRepo.findById(req.params.id);
        if (!existing) throw new HttpError(404, 'Character not found');
        const role = await roomRepo.getRoleInRoom(
          existing.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const dto = await characterService.getForViewer(
          req.params.id,
          role,
          req.user!.id,
        );
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.patch(
    '/characters/:id',
    jwtAuth,
    validate(characterUpdateSchema),
    async (req: Request<{ id: string }, object, CharacterUpdateRequest>, res: Response) => {
      try {
        const existing = await characterRepo.findById(req.params.id);
        if (!existing) throw new HttpError(404, 'Character not found');
        const role = await roomRepo.getRoleInRoom(
          existing.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const dto = await characterService.update(
          req.params.id,
          req.user!.id,
          role,
          req.body,
        );
        res.json(dto);
        if (io) {
          await broadcastCharacterUpsert(
            io,
            existing.roomId,
            dto.id,
            characterService,
            characterRepo,
            'character:updated',
          );
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.delete(
    '/characters/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const existing = await characterRepo.findById(req.params.id);
        if (!existing) throw new HttpError(404, 'Character not found');
        const role = await roomRepo.getRoleInRoom(
          existing.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const roomId = existing.roomId;
        const characterId = req.params.id;
        await characterService.delete(characterId, req.user!.id, role);
        res.status(204).send();
        if (io) {
          io.in(roomId).emit('character:deleted', { roomId, characterId });
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/characters/:id/pdf',
    jwtAuth,
    express.raw({ type: 'application/pdf', limit: '20mb' }),
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const existing = await characterRepo.findById(req.params.id);
        if (!existing) throw new HttpError(404, 'Character not found');
        const role = await roomRepo.getRoleInRoom(
          existing.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const body = req.body;
        if (!Buffer.isBuffer(body) || body.length === 0) {
          throw new HttpError(400, 'PDF body is empty or not a buffer');
        }
        const dto = await characterService.uploadPdf(
          req.params.id,
          req.user!.id,
          role,
          body,
          'application/pdf',
        );
        res.json(dto);
        if (io) {
          await broadcastCharacterUpsert(
            io,
            existing.roomId,
            dto.id,
            characterService,
            characterRepo,
            'character:updated',
          );
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
