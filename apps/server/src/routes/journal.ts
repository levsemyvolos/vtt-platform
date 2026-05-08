import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { Server } from 'socket.io';
import type { JournalCreateRequest, JournalUpdateRequest, JournalGrantRequest } from '@vtt/shared';
import type { JournalService } from '../services/JournalService.js';
import type { JournalRepository } from '../repositories/JournalRepository.js';
import type { JournalEntryWithRelations } from '../repositories/JournalRepository.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { validate } from '../middleware/validate.js';
import {
  journalCreateSchema,
  journalUpdateSchema,
  journalGrantSchema,
} from '../schemas/journal.schema.js';
import { HttpError } from '../lib/errors.js';
import type { Role } from '@vtt/shared';

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
}

/**
 * Per-socket projection broadcast for journal events.
 *
 * Strategy (S10 T3):
 * - `deleted` → broadcast `journal:deleted` to all sockets in the room.
 * - `created` / `updated` → for each socket: if viewer can see the entry,
 *   send per-viewer projected DTO; otherwise send `journal:deleted` so the
 *   client purges any stale local copy (handles revoke scenario).
 */
async function broadcastJournalEvent(
  io: Server,
  service: JournalService,
  entry: JournalEntryWithRelations,
  roomId: string,
  type: 'created' | 'updated' | 'deleted',
): Promise<void> {
  if (type === 'deleted') {
    io.in(roomId).emit('journal:deleted', { roomId, entryId: entry.id });
    return;
  }

  const sockets = await io.in(roomId).fetchSockets();
  for (const s of sockets) {
    const viewerId = s.data.userId as string | undefined;
    const viewerRole = s.data.role as Role | undefined;
    if (!viewerId || !viewerRole) continue;

    if (service.canView(entry, viewerId, viewerRole)) {
      const dto = service.projectForViewer(entry);
      const eventName = type === 'created' ? 'journal:created' : 'journal:updated';
      s.emit(eventName, { roomId, entry: dto });
    } else {
      // Viewer lost access (e.g., revoke removed them from recipients) — instruct purge.
      s.emit('journal:deleted', { roomId, entryId: entry.id });
    }
  }
}

/**
 * REST router for journal entries (Ф10 — S10).
 *
 * Routes:
 *   GET    /rooms/:roomId/journal          list visible entries for viewer
 *   POST   /rooms/:roomId/journal          create new entry (GM only)
 *   GET    /journal/:id                    single entry (author/GM/recipient)
 *   PATCH  /journal/:id                    update (author or GM)
 *   DELETE /journal/:id                    delete (author or GM)
 *   POST   /journal/:id/grant              replace recipient list (GM only)
 *
 * `io` is optional — when null (test environment) broadcasts are skipped.
 */
export function buildJournalRouter(
  journalService: JournalService,
  journalRepo: JournalRepository,
  roomRepo: RoomRepository,
  io: Server | null,
): IRouter {
  const router = Router();

  // GET /rooms/:roomId/journal — list visible entries for the calling viewer.
  router.get(
    '/rooms/:roomId/journal',
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
        const entries = await journalService.listForViewer(
          req.params.roomId,
          req.user!.id,
          role,
        );
        res.json({ entries });
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // POST /rooms/:roomId/journal — GM creates a new private journal entry.
  router.post(
    '/rooms/:roomId/journal',
    jwtAuth,
    validate(journalCreateSchema),
    async (
      req: Request<{ roomId: string }, object, JournalCreateRequest>,
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
        const entry = await journalService.create(req.params.roomId, req.user!.id, req.body);
        res.status(201).json(journalService.projectForViewer(entry));
        if (io) {
          await broadcastJournalEvent(io, journalService, entry, req.params.roomId, 'created');
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // GET /journal/:id — single entry (visibility enforced by service).
  router.get(
    '/journal/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const raw = await journalRepo.findById(req.params.id);
        if (!raw) throw new HttpError(404, 'Journal entry not found');
        const role = await roomRepo.getRoleInRoom(
          raw.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const dto = await journalService.getForViewer(req.params.id, req.user!.id, role);
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // PATCH /journal/:id — update content (author or GM).
  router.patch(
    '/journal/:id',
    jwtAuth,
    validate(journalUpdateSchema),
    async (req: Request<{ id: string }, object, JournalUpdateRequest>, res: Response) => {
      try {
        const raw = await journalRepo.findById(req.params.id);
        if (!raw) throw new HttpError(404, 'Journal entry not found');
        const role = await roomRepo.getRoleInRoom(
          raw.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const updated = await journalService.update(
          req.params.id,
          req.user!.id,
          role,
          req.body,
        );
        res.json(journalService.projectForViewer(updated));
        if (io) {
          await broadcastJournalEvent(io, journalService, updated, raw.roomId, 'updated');
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // DELETE /journal/:id — delete entry (author or GM).
  router.delete(
    '/journal/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const raw = await journalRepo.findById(req.params.id);
        if (!raw) throw new HttpError(404, 'Journal entry not found');
        const role = await roomRepo.getRoleInRoom(
          raw.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const deleted = await journalService.delete(req.params.id, req.user!.id, role);
        res.status(204).send();
        if (io) {
          await broadcastJournalEvent(io, journalService, deleted, raw.roomId, 'deleted');
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // POST /journal/:id/grant — replace recipient list (GM only).
  router.post(
    '/journal/:id/grant',
    jwtAuth,
    validate(journalGrantSchema),
    async (req: Request<{ id: string }, object, JournalGrantRequest>, res: Response) => {
      try {
        const raw = await journalRepo.findById(req.params.id);
        if (!raw) throw new HttpError(404, 'Journal entry not found');
        const role = await roomRepo.getRoleInRoom(
          raw.roomId,
          req.user!.id,
          req.user!.role,
          req.user!.boundRoomId,
        );
        if (!role) throw new HttpError(404, 'Room not found');
        const updated = await journalService.grant(req.params.id, req.body.userIds, role);
        res.json(journalService.projectForViewer(updated));
        if (io) {
          await broadcastJournalEvent(io, journalService, updated, raw.roomId, 'updated');
        }
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
