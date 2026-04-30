import { Router, type IRouter, type Request, type Response } from 'express';
import type {
  AudioFinalizeRequest,
  AudioListResponse,
  AudioPatchRequest,
  AudioPlaybackUrlResponse,
  AudioTrackDTO,
  AudioUploadInitRequest,
  AudioUploadInitResponse,
} from '@vtt/shared';
import type { AudioService } from '../services/AudioService.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { requireRole } from '../middleware/rbac.js';
import { HttpError } from '../lib/errors.js';

function handleError(err: unknown, res: Response): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
  } else {
    res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
  }
}

/**
 * REST surface for the music-track feature (Ф6, §2.16). Mounts at app root
 * so it can own both `/audio/*` and `/rooms/:id/audio`. RBAC (§2.18): writes
 * are GM-only — `assertRoomOwner` runs after `requireRole` so a GM in room A
 * still cannot mutate tracks of room B.
 */
export function buildAudioRouter(audioService: AudioService): IRouter {
  const router = Router();

  // ----- Step 1: presigned PUT init (GM only) -----
  router.post(
    '/audio/uploads',
    jwtAuth,
    requireRole('GM', 'Player'),
    async (req: Request<object, object, AudioUploadInitRequest>, res: Response) => {
      try {
        await audioService.assertRoomOwner(req.body.roomId, req.user!.id);
        const out: AudioUploadInitResponse = await audioService.initUpload(req.body);
        res.status(201).json(out);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // ----- Step 3: finalize upload, persist Asset + AudioTrack -----
  router.post(
    '/audio',
    jwtAuth,
    requireRole('GM', 'Player'),
    async (req: Request<object, object, AudioFinalizeRequest>, res: Response) => {
      try {
        await audioService.assertRoomOwner(req.body.roomId, req.user!.id);
        const track = await audioService.finalizeUpload(req.body, req.user!.id);
        const dto: AudioTrackDTO = await audioService.toDTO(track);
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // ----- List tracks of a room (any authenticated member) -----
  router.get(
    '/rooms/:id/audio',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const tracks = await audioService.listByRoom(req.params.id);
        const dtos = await Promise.all(tracks.map((t) => audioService.toDTO(t)));
        const body: AudioListResponse = { tracks: dtos };
        res.json(body);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // ----- Edit track (GM only) -----
  router.patch(
    '/audio/:id',
    jwtAuth,
    requireRole('GM', 'Player'),
    async (
      req: Request<{ id: string }, object, AudioPatchRequest>,
      res: Response,
    ) => {
      try {
        const existing = await audioService.getById(req.params.id);
        await audioService.assertRoomOwner(existing.roomId, req.user!.id);
        const updated = await audioService.patchTrack(req.params.id, req.body);
        const dto = await audioService.toDTO(updated);
        res.json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // ----- Delete track (GM only) -----
  router.delete(
    '/audio/:id',
    jwtAuth,
    requireRole('GM', 'Player'),
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const existing = await audioService.getById(req.params.id);
        await audioService.assertRoomOwner(existing.roomId, req.user!.id);
        await audioService.deleteTrack(req.params.id);
        res.status(204).send();
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // ----- Fresh presigned playback URL (any authenticated member) -----
  router.get(
    '/audio/:id/url',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const track = await audioService.getById(req.params.id);
        const dto = await audioService.toDTO(track);
        const body: AudioPlaybackUrlResponse = { url: dto.url };
        res.json(body);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
