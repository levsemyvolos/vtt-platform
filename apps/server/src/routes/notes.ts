import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import type { NoteCreateRequest, NoteUpdateRequest } from '@vtt/shared';
import type { NoteService } from '../services/NoteService.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { validate } from '../middleware/validate.js';
import { noteCreateSchema, noteUpdateSchema } from '../schemas/note.schema.js';
import { HttpError } from '../lib/errors.js';

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
    return;
  }
  res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
}

/**
 * REST router for private GM notes (Ф7.1).
 *
 * Note that single-note routes (GET/PATCH/DELETE /notes/:id) do NOT consult
 * RoomRepository — author-only authorisation inside NoteService is the sole
 * gate (a note's author is the only legitimate viewer regardless of role).
 */
export function buildNotesRouter(
  noteService: NoteService,
  roomRepo: RoomRepository,
): IRouter {
  const router = Router();

  router.get(
    '/rooms/:roomId/notes',
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
        const notes = await noteService.listForAuthor(req.params.roomId, req.user!.id);
        res.json(notes);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/rooms/:roomId/notes',
    jwtAuth,
    validate(noteCreateSchema),
    async (
      req: Request<{ roomId: string }, object, NoteCreateRequest>,
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
        const dto = await noteService.create(
          req.params.roomId,
          role,
          req.user!.id,
          req.body,
        );
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.get(
    '/notes/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const dto = await noteService.getById(req.params.id, req.user!.id);
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.patch(
    '/notes/:id',
    jwtAuth,
    validate(noteUpdateSchema),
    async (req: Request<{ id: string }, object, NoteUpdateRequest>, res: Response) => {
      try {
        const dto = await noteService.update(req.params.id, req.user!.id, req.body);
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.delete(
    '/notes/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        await noteService.delete(req.params.id, req.user!.id);
        res.status(204).send();
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
