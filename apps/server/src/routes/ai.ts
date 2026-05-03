import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { AIImageRequest, AIMusicRequest, AssistantTextRequest, SaveAssistantMessageRequest } from '@vtt/shared';
import type { AIService } from '../services/AIService.js';
import type { AssistantService } from '../services/AssistantService.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { requireRoomGM } from '../middleware/requireRoomGM.js';
import { HttpError } from '../lib/errors.js';
import { AIQuotaError } from '../infrastructure/ai/AIProvider.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';

/**
 * Per-user rate limiter for AI endpoints — 10 req/min (T10, STRIDE table 2.18).
 * The window is keyed on `req.user.id` (jwtAuth runs before the limiter), so
 * unauthenticated callers are rejected by 401 earlier.
 */
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: { code: 429, message: 'AI request rate limit exceeded' } },
});

function handleError(err: unknown, res: Response): void {
  if (err instanceof AIQuotaError) {
    res.status(503).json({ error: { code: 503, message: err.message } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.status, message: err.message } });
    return;
  }
  // Diagnostic: surface the underlying Vertex AI / SDK error in Render logs
  // so 5xx causes (model-not-found, IAM, transport) can be inspected without
  // exposing raw details to the client.
  // eslint-disable-next-line no-console
  console.error('[ai] unhandled error:', err);
  res.status(500).json({ error: { code: 500, message: 'Internal server error' } });
}

export function buildAiRouter(
  aiService: AIService,
  assistantService: AssistantService,
  roomRepo: RoomRepository,
): IRouter {
  const router = Router();
  const roomGM = requireRoomGM(roomRepo);

  router.post(
    '/image',
    jwtAuth,
    aiRateLimiter,
    roomGM,
    async (req: Request<object, object, AIImageRequest>, res: Response) => {
      try {
        const result = await aiService.generateImage(req.user!.id, req.body);
        res.status(201).json(result);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/music',
    jwtAuth,
    aiRateLimiter,
    roomGM,
    async (req: Request<object, object, AIMusicRequest>, res: Response) => {
      try {
        const result = await aiService.generateMusic(req.user!.id, req.body);
        res.status(201).json(result);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  router.post(
    '/text',
    jwtAuth,
    aiRateLimiter,
    roomGM,
    async (req: Request<object, object, AssistantTextRequest>, res: Response) => {
      try {
        const result = await assistantService.generateAssistantText(req.body);
        res.status(200).json(result);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * POST /ai/messages
   * Persists a user or assistant message to DB (Ф8.1, LEV-MANUAL-004).
   * RBAC: jwtAuth only — GM or Player can save messages for their room.
   */
  router.post(
    '/messages',
    jwtAuth,
    async (req: Request<object, object, SaveAssistantMessageRequest>, res: Response) => {
      try {
        const { roomId, role, content } = req.body;
        if (!roomId || !role || !content) {
          res.status(400).json({ error: { code: 400, message: 'roomId, role, content are required' } });
          return;
        }
        if (role !== 'user' && role !== 'assistant') {
          res.status(400).json({ error: { code: 400, message: 'role must be user or assistant' } });
          return;
        }
        const dto = await assistantService.saveMessage({ roomId, role, content }, req.user!.id);
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * GET /ai/messages?roomId=<uuid>
   * Returns persisted assistant message history for a room (Ф8.1, LEV-MANUAL-004).
   * RBAC: jwtAuth — GM or room member.
   */
  router.get(
    '/messages',
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const roomId = req.query['roomId'] as string | undefined;
        if (!roomId) {
          res.status(400).json({ error: { code: 400, message: 'roomId query param is required' } });
          return;
        }
        // RBAC: verify caller is room owner or member
        const room = await roomRepo.findById(roomId);
        if (!room) {
          res.status(404).json({ error: { code: 404, message: 'Room not found' } });
          return;
        }
        if (room.ownerId !== req.user!.id) {
          const isMember = await roomRepo.isMember(roomId, req.user!.id);
          if (!isMember) {
            res.status(403).json({ error: { code: 403, message: 'Not a room member' } });
            return;
          }
        }
        const result = await assistantService.getHistory(roomId);
        res.json(result);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  return router;
}
