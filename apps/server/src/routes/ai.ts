import { Router, type IRouter } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type {
  AIImageRequest,
  AIMusicRequest,
  AssistantTextRequest,
  SaveAssistantMessageRequest,
  CreateAssistantConversationRequest,
  RenameAssistantConversationRequest,
  UpdateConversationDefaultsRequest,
  AssistantStreamEvent,
  AssistantStreamRequest,
  SRDLookupRequest,
  SRDLookupResponse,
  PromptAssistRequest,
  PromptAssistResponse,
  CreateImageConversationRequest,
  RenameImageConversationRequest,
  ContinueImageConversationRequest,
  ContinueImageConversationResponse,
  ListImageConversationsResponse,
  ListImageTurnsResponse,
} from '@vtt/shared';
import type { AIService } from '../services/AIService.js';
import type { AssistantService } from '../services/AssistantService.js';
import type { ImageAssistantService } from '../services/ImageAssistantService.js';
import { jwtAuth } from '../middleware/jwtAuth.js';
import { requireRoomGM } from '../middleware/requireRoomGM.js';
import { HttpError } from '../lib/errors.js';
import { buildSseStream } from '../lib/sseStream.js';
import {
  AIQuotaError,
  AISafetyError,
  AIInvalidPromptError,
  AINetworkError,
} from '../infrastructure/ai/AIProvider.js';
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

/**
 * Looser rate limiter for the SRD lookup endpoint — 5 req/min per user.
 * Separate budget so player SRD queries don't deplete GM's AI quota.
 */
const srdRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'anonymous',
  message: { error: { code: 429, kind: 'ai_quota', message: 'SRD request rate limit exceeded' } },
});

export function handleError(err: unknown, res: Response): void {
  if (err instanceof AIQuotaError) {
    res.status(503).json({ error: { code: 503, kind: 'ai_quota', message: err.message } });
    return;
  }
  if (err instanceof AISafetyError) {
    res.status(422).json({ error: { code: 422, kind: 'ai_safety', message: err.message } });
    return;
  }
  if (err instanceof AIInvalidPromptError) {
    res.status(400).json({ error: { code: 400, kind: 'ai_invalid_prompt', message: err.message } });
    return;
  }
  if (err instanceof AINetworkError) {
    res.status(504).json({ error: { code: 504, kind: 'ai_network', message: err.message } });
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
  res.status(500).json({ error: { code: 500, kind: 'ai_unknown', message: 'Internal server error' } });
}

/**
 * Maps service-layer string-message errors (NOT_FOUND / FORBIDDEN / INVALID_TITLE)
 * to HTTP responses. Unknown errors fall through to handleError.
 */
function mapServiceError(err: unknown, res: Response): void {
  if (err instanceof Error) {
    if (err.message === 'NOT_FOUND') {
      res.status(404).json({ error: { code: 404, message: 'Conversation not found' } });
      return;
    }
    if (err.message === 'FORBIDDEN') {
      res.status(403).json({ error: { code: 403, message: 'Not the conversation owner' } });
      return;
    }
    if (err.message === 'INVALID_TITLE') {
      res.status(400).json({ error: { code: 400, message: 'Title must not be empty' } });
      return;
    }
    if (err.message === 'TOO_MANY_REFERENCES') {
      res.status(400).json({ error: { code: 400, kind: 'ai_invalid_prompt', message: 'Maximum 3 reference assets' } });
      return;
    }
    if (err.message === 'REFERENCE_NOT_FOUND') {
      res.status(404).json({ error: { code: 404, message: 'Reference asset not found in this room' } });
      return;
    }
  }
  handleError(err, res);
}

const STREAM_ERROR_MESSAGES: Record<string, AssistantStreamEvent> = {
  NOT_FOUND: { type: 'error', kind: 'ai_unknown', message: 'Conversation not found' },
  FORBIDDEN: { type: 'error', kind: 'ai_unknown', message: 'Not the conversation owner' },
  INVALID_TARGET: { type: 'error', kind: 'ai_invalid_prompt', message: 'Can only edit user messages' },
  INVALID_CONTENT: { type: 'error', kind: 'ai_invalid_prompt', message: 'Edited content is empty' },
  NO_USER_MESSAGE: { type: 'error', kind: 'ai_invalid_prompt', message: 'No user message to regenerate from' },
};

function errToStreamEvent(err: unknown): AssistantStreamEvent {
  if (err instanceof AIQuotaError) return { type: 'error', kind: 'ai_quota', message: err.message };
  if (err instanceof AISafetyError) return { type: 'error', kind: 'ai_safety', message: err.message };
  if (err instanceof AIInvalidPromptError) return { type: 'error', kind: 'ai_invalid_prompt', message: err.message };
  if (err instanceof AINetworkError) return { type: 'error', kind: 'ai_network', message: err.message };
  if (err instanceof Error) {
    const mapped = STREAM_ERROR_MESSAGES[err.message];
    if (mapped) return mapped;
  }
  // eslint-disable-next-line no-console
  console.error('[ai] streaming unhandled error:', err);
  return { type: 'error', kind: 'ai_unknown', message: 'Internal server error' };
}

export function buildAiRouter(
  aiService: AIService,
  assistantService: AssistantService,
  imageAssistantService: ImageAssistantService,
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

  // P2.2 — Token image generation (S4.2)
  router.post(
    '/image/token',
    jwtAuth,
    aiRateLimiter,
    roomGM,
    async (req: Request<object, object, AIImageRequest>, res: Response) => {
      try {
        const result = await aiService.generateToken(req.user!.id, req.body);
        res.status(201).json(result);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  // P2.3 — Battlemap image generation (S4.3)
  router.post(
    '/image/battlemap',
    jwtAuth,
    aiRateLimiter,
    roomGM,
    async (req: Request<object, object, AIImageRequest>, res: Response) => {
      try {
        const result = await aiService.generateBattlemap(req.user!.id, req.body);
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

  /**
   * POST /ai/prompt-assist
   * S7.1 / P5.3 — LLM-as-prompt-generator. GM-only (cost-coupling: the only
   * downstream consumers, /image and /music, are GM-gated). One-shot, no
   * persistence. Body: { roomId, target: 'image' | 'music', userPrompt }.
   */
  router.post(
    '/prompt-assist',
    jwtAuth,
    aiRateLimiter,
    roomGM,
    async (req: Request<object, object, PromptAssistRequest>, res: Response) => {
      try {
        const { roomId, target, userPrompt } = req.body;
        if (!roomId || !target || !userPrompt) {
          res.status(400).json({ error: { code: 400, message: 'roomId, target, userPrompt are required' } });
          return;
        }
        if (target !== 'image' && target !== 'music') {
          res.status(400).json({ error: { code: 400, kind: 'ai_invalid_prompt', message: 'target must be image or music' } });
          return;
        }
        const result: PromptAssistResponse = await assistantService.generatePromptDraft({ roomId, target, userPrompt });
        res.json(result);
      } catch (err) {
        if (err instanceof Error && err.message === 'INVALID_CONTENT') {
          res.status(400).json({ error: { code: 400, kind: 'ai_invalid_prompt', message: 'Prompt is empty or too long' } });
          return;
        }
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
   * POST /ai/srd
   * Player+GM SRD rule lookup. Owner OR member of the room may call.
   * No DB write, no history.
   * Body: { roomId, prompt }.
   */
  router.post(
    '/srd',
    jwtAuth,
    srdRateLimiter,
    async (req: Request<object, object, SRDLookupRequest>, res: Response) => {
      try {
        const { roomId, prompt } = req.body;
        if (!roomId || !prompt) {
          res.status(400).json({ error: { code: 400, message: 'roomId and prompt are required' } });
          return;
        }
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
        const content = await assistantService.lookupSRD(prompt);
        const response: SRDLookupResponse = { content };
        res.json(response);
      } catch (err) {
        if (err instanceof Error && err.message === 'INVALID_CONTENT') {
          res.status(400).json({ error: { code: 400, kind: 'ai_invalid_prompt', message: 'Prompt is empty or too long' } });
          return;
        }
        handleError(err, res);
      }
    },
  );

  router.post(
    '/text/stream',
    jwtAuth,
    aiRateLimiter,
    async (req: Request<object, object, AssistantStreamRequest>, res: Response) => {
      // SSE headers + 15s heartbeat are set up by buildSseStream — see
      // lib/sseStream.ts for the heartbeat rationale (proxy idle-drop with
      // preview-tier model latencies).
      const { emit, controller, cleanup } = buildSseStream(req, res);
      try {
        await assistantService.streamAndPersist(req.body, req.user!.id, emit, controller.signal);
      } catch (err) {
        emit(errToStreamEvent(err));
      } finally {
        cleanup();
        res.end();
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
        const { roomId, role, content, conversationId, context } = req.body;
        if (!roomId || !role || !content) {
          res.status(400).json({ error: { code: 400, message: 'roomId, role, content are required' } });
          return;
        }
        if (role !== 'user' && role !== 'assistant') {
          res.status(400).json({ error: { code: 400, message: 'role must be user or assistant' } });
          return;
        }
        const payload: SaveAssistantMessageRequest = {
          roomId,
          role,
          content,
          ...(conversationId ? { conversationId } : {}),
          ...(context ? { context } : {}),
        };
        const dto = await assistantService.saveMessage(payload, req.user!.id);
        res.status(201).json(dto);
      } catch (err) {
        mapServiceError(err, res);
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

  /**
   * GET /ai/conversations?roomId=<uuid>
   * Lists conversations the requesting user owns inside a room.
   * RBAC: jwtAuth + member-of-room (owner or invited player).
   */
  router.get(
    '/conversations',
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const roomId = req.query['roomId'] as string | undefined;
        if (!roomId) {
          res.status(400).json({ error: { code: 400, message: 'roomId query param is required' } });
          return;
        }
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
        const result = await assistantService.listConversations(roomId, req.user!.id);
        res.json(result);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * POST /ai/conversations
   * Creates a new conversation owned by the requesting user.
   * Body: { roomId, context, title? }
   * RBAC: jwtAuth + member-of-room.
   */
  router.post(
    '/conversations',
    jwtAuth,
    async (req: Request<object, object, CreateAssistantConversationRequest>, res: Response) => {
      try {
        const { roomId, context, title } = req.body;
        if (!roomId || !context) {
          res.status(400).json({ error: { code: 400, message: 'roomId and context are required' } });
          return;
        }
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
        const { defaults } = req.body;
        const convReq: CreateAssistantConversationRequest = { roomId, context };
        if (title !== undefined) convReq.title = title;
        if (defaults !== undefined) convReq.defaults = defaults;
        const dto = await assistantService.createConversation(convReq, req.user!.id);
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * PATCH /ai/conversations/:id
   * Renames a conversation. Body: { title }.
   * RBAC: jwtAuth + ownership (verified inside the service).
   */
  router.patch(
    '/conversations/:id',
    jwtAuth,
    async (req: Request<{ id: string }, object, RenameAssistantConversationRequest>, res: Response) => {
      try {
        const { id } = req.params;
        const { title } = req.body;
        if (!title || typeof title !== 'string') {
          res.status(400).json({ error: { code: 400, message: 'title is required' } });
          return;
        }
        const dto = await assistantService.renameConversation(id, { title }, req.user!.id);
        res.json(dto);
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * PATCH /ai/conversations/:id/defaults
   * Replaces per-conversation default variables (ruleset/setting/tone/...).
   * Body: { defaults: AssistantVariables }. Owner-only (verified in service).
   */
  router.patch(
    '/conversations/:id/defaults',
    jwtAuth,
    async (req: Request<{ id: string }, object, UpdateConversationDefaultsRequest>, res: Response) => {
      try {
        const { id } = req.params;
        const body = req.body;
        if (!body || typeof body !== 'object' || typeof body.defaults !== 'object' || body.defaults === null) {
          res.status(400).json({ error: { code: 400, message: 'defaults object is required' } });
          return;
        }
        const dto = await assistantService.updateConversationDefaults(id, body.defaults, req.user!.id);
        res.json(dto);
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * DELETE /ai/conversations/:id
   * Deletes the conversation (cascades messages via FK).
   * RBAC: jwtAuth + ownership.
   */
  router.delete(
    '/conversations/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        await assistantService.deleteConversation(req.params.id, req.user!.id);
        res.status(204).end();
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * GET /ai/conversations/:id/messages
   * Returns all messages for a conversation, oldest-first.
   * RBAC: jwtAuth + ownership.
   */
  router.get(
    '/conversations/:id/messages',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const result = await assistantService.getConversationMessages(req.params.id, req.user!.id);
        res.json(result);
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * GET /ai/quota?roomId=<uuid>
   * Real AI usage stats for the room — used by RecentGenerations quota strip.
   * RBAC: jwtAuth + room member.
   */
  router.get(
    '/quota',
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const roomId = req.query['roomId'] as string | undefined;
        if (!roomId) {
          res.status(400).json({ error: { code: 400, message: 'roomId query param is required' } });
          return;
        }
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
        const quota = await assistantService.getRoomQuota(roomId);
        res.json(quota);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * GET /ai/conversations/:id/context-preview
   * Returns the session-context markdown block server would inject.
   */
  router.get(
    '/conversations/:id/context-preview',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const text = await assistantService.getContextPreview(req.params.id, req.user!.id);
        res.json({ text });
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * POST /ai/conversations/:id/regenerate
   * SSE stream — replays last user message, drops previous assistant reply.
   */
  router.post(
    '/conversations/:id/regenerate',
    jwtAuth,
    aiRateLimiter,
    async (req: Request<{ id: string }>, res: Response) => {
      const { emit, controller, cleanup } = buildSseStream(req, res);
      try {
        await assistantService.regenerateAndStream(req.params.id, req.user!.id, emit, controller.signal);
      } catch (err) {
        emit(errToStreamEvent(err));
      } finally {
        cleanup();
        res.end();
      }
    },
  );

  /**
   * POST /ai/conversations/:id/messages/:msgId/edit
   * Body: { content }. SSE stream — edits a user message, drops following turns,
   * restreams a fresh assistant reply.
   */
  router.post(
    '/conversations/:id/messages/:msgId/edit',
    jwtAuth,
    aiRateLimiter,
    async (req: Request<{ id: string; msgId: string }, object, { content: string }>, res: Response) => {
      const { emit, controller, cleanup } = buildSseStream(req, res);
      try {
        const content = req.body?.content ?? '';
        await assistantService.editAndStream(
          req.params.id,
          req.params.msgId,
          content,
          req.user!.id,
          emit,
          controller.signal,
        );
      } catch (err) {
        emit(errToStreamEvent(err));
      } finally {
        cleanup();
        res.end();
      }
    },
  );

  /**
   * GET /ai/image-conversations?roomId=<uuid>
   * Lists user's image-generation threads in a room.
   */
  router.get(
    '/image-conversations',
    jwtAuth,
    async (req: Request, res: Response) => {
      try {
        const roomId = req.query['roomId'] as string | undefined;
        if (!roomId) {
          res.status(400).json({ error: { code: 400, message: 'roomId query param is required' } });
          return;
        }
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
        const conversations = await imageAssistantService.listConversations(roomId, req.user!.id);
        const response: ListImageConversationsResponse = { conversations };
        res.json(response);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * POST /ai/image-conversations
   * Body: { roomId, title? }
   *
   * RBAC: GM-only. Image-conversation
   * threads invoke Nano Banana 2 (preview-tier, expensive per call) on every
   * turn, so creation must be gated to the room owner. Member-level access
   * would let Players burn the project's Vertex budget through the same
   * cost-amplification vector closed on the legacy /image route long ago.
   */
  router.post(
    '/image-conversations',
    jwtAuth,
    roomGM,
    async (req: Request<object, object, CreateImageConversationRequest>, res: Response) => {
      try {
        const { roomId, title } = req.body;
        if (!roomId) {
          res.status(400).json({ error: { code: 400, message: 'roomId is required' } });
          return;
        }
        // requireRoomGM has already verified the room exists and the caller is
        // its GM, so we can skip the redundant findById/isMember probes and
        // proceed straight to creation.
        const dto = await imageAssistantService.createConversation(roomId, req.user!.id, title ?? '');
        res.status(201).json(dto);
      } catch (err) {
        handleError(err, res);
      }
    },
  );

  /**
   * PATCH /ai/image-conversations/:id
   * Body: { title }
   */
  router.patch(
    '/image-conversations/:id',
    jwtAuth,
    async (req: Request<{ id: string }, object, RenameImageConversationRequest>, res: Response) => {
      try {
        const { id } = req.params;
        const { title } = req.body;
        if (!title || typeof title !== 'string') {
          res.status(400).json({ error: { code: 400, message: 'title is required' } });
          return;
        }
        const dto = await imageAssistantService.renameConversation(id, title, req.user!.id);
        res.json(dto);
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * DELETE /ai/image-conversations/:id
   */
  router.delete(
    '/image-conversations/:id',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        await imageAssistantService.deleteConversation(req.params.id, req.user!.id);
        res.status(204).end();
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * GET /ai/image-conversations/:id/turns
   */
  router.get(
    '/image-conversations/:id/turns',
    jwtAuth,
    async (req: Request<{ id: string }>, res: Response) => {
      try {
        const turns = await imageAssistantService.listTurns(req.params.id, req.user!.id);
        const response: ListImageTurnsResponse = { turns };
        res.json(response);
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  /**
   * POST /ai/image-conversations/:id/turns
   * Body: { prompt, referenceAssetIds? }
   *
   * Note: this endpoint is rate-limited via the shared `aiRateLimiter` (10/min).
   * NB2 is significantly slower (~13s median) so the user-facing latency is the
   * bottleneck — rate-limiting only protects against pathological abuse.
   */
  router.post(
    '/image-conversations/:id/turns',
    jwtAuth,
    aiRateLimiter,
    async (req: Request<{ id: string }, object, ContinueImageConversationRequest>, res: Response) => {
      try {
        const { prompt, referenceAssetIds } = req.body;
        if (!prompt || typeof prompt !== 'string') {
          res.status(400).json({ error: { code: 400, message: 'prompt is required' } });
          return;
        }
        const result = await imageAssistantService.continueConversation(
          req.params.id,
          prompt,
          referenceAssetIds ?? [],
          req.user!.id,
        );
        const response: ContinueImageConversationResponse = result;
        res.status(201).json(response);
      } catch (err) {
        mapServiceError(err, res);
      }
    },
  );

  return router;
}
