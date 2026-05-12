/**
 * AI routes — RBAC integration tests.
 *
 * Background:
 *   POST /ai/image-conversations was authorised at the level of "any room
 *   member" instead of "GM only". Players holding a member-level JWT could
 *   create image-conversation threads and burn the project's Vertex budget on
 *   Nano Banana 2 generations (preview-tier model, expensive per call).
 *   Image generation was always GM-only on the legacy /image route
 *   (`requireRoomGM` middleware); the /image-conversations CREATE route
 *   accidentally diverged from this pattern.
 *
 * What this test asserts:
 *   1. POST /ai/image-conversations with a Player member JWT → 403.
 *      (Before the fix this returned 201 — the leak.)
 *   2. POST /ai/image-conversations with a non-member outsider JWT → 403.
 *      (This was 403 before too via the inner member check, but the response
 *      shape is now uniform — `requireRoomGM` always returns the same 403.)
 *   3. POST /ai/image-conversations with the GM owner JWT → 201.
 *      Sanity check that the gate doesn't lock out the legitimate creator.
 *
 * Stubs: AIService, AssistantService and ImageAssistantService are minimal
 * — only `imageAssistantService.createConversation` is exercised in the GM
 * happy-path. The `RoomRepository` stub returns a deterministic role mapping
 * keyed on userId, mirroring the production `getRoleInRoom()` behaviour.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { buildAiRouter } from '../../src/routes/ai.js';
import type { AIService } from '../../src/services/AIService.js';
import type { AssistantService } from '../../src/services/AssistantService.js';
import type { ImageAssistantService } from '../../src/services/ImageAssistantService.js';
import type { RoomRepository } from '../../src/repositories/RoomRepository.js';

const JWT_SECRET = process.env['JWT_SECRET'] as string;

const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const GM_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAYER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OUTSIDER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId, role: 'Player', sid: `sess-${userId}` },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

function makeRoomRepo(): RoomRepository {
  return {
    findById: vi.fn().mockImplementation((id: string) => {
      if (id === ROOM_ID) return Promise.resolve({ id: ROOM_ID, ownerId: GM_ID, name: 'Test Room' });
      return Promise.resolve(null);
    }),
    isMember: vi.fn().mockImplementation((_: string, userId: string) => {
      // GM is implicitly the room owner, treat as member for the inner route check
      return Promise.resolve(userId === GM_ID || userId === PLAYER_ID);
    }),
    getRoleInRoom: vi.fn().mockImplementation((_: string, userId: string) => {
      if (userId === GM_ID) return Promise.resolve('GM');
      if (userId === PLAYER_ID) return Promise.resolve('Player');
      return Promise.resolve(null);
    }),
  } as unknown as RoomRepository;
}

function makeStubs() {
  const aiService = {} as AIService;
  const assistantService = {
    generatePromptDraft: vi.fn().mockResolvedValue({ draft: 'IMAGE PROMPT: stub' }),
  } as unknown as AssistantService;
  const imageAssistantService = {
    createConversation: vi.fn().mockResolvedValue({
      id: 'conv-stub-id',
      roomId: ROOM_ID,
      ownerId: GM_ID,
      title: 'New Image Thread',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  } as unknown as ImageAssistantService;
  return { aiService, assistantService, imageAssistantService };
}

function makeApp(): express.Express {
  const app = express();
  app.use(express.json());
  const { aiService, assistantService, imageAssistantService } = makeStubs();
  app.use('/ai', buildAiRouter(aiService, assistantService, imageAssistantService, makeRoomRepo()));
  return app;
}

describe('AI image-conversations RBAC — POST /ai/image-conversations', () => {
  it('Player member → 403 (cost-amplification gate)', async () => {
    const app = makeApp();
    const token = makeAccessToken(PLAYER_ID);

    const res = await request(app)
      .post('/ai/image-conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: ROOM_ID, title: 'attempt-from-player' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe(403);
  });

  it('Non-member outsider → 403 (uniform GM-only gate)', async () => {
    const app = makeApp();
    const token = makeAccessToken(OUTSIDER_ID);

    const res = await request(app)
      .post('/ai/image-conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: ROOM_ID, title: 'outsider-attempt' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe(403);
  });

  it('GM owner → 201', async () => {
    const app = makeApp();
    const token = makeAccessToken(GM_ID);

    const res = await request(app)
      .post('/ai/image-conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: ROOM_ID, title: 'legitimate-thread' });

    expect(res.status).toBe(201);
    expect(res.body?.id).toBe('conv-stub-id');
  });

  it('Missing/invalid token → 401 (jwtAuth gate sits before roomGM)', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/ai/image-conversations')
      .send({ roomId: ROOM_ID, title: 'no-auth' });

    expect(res.status).toBe(401);
  });
});

/**
 * `/ai/prompt-assist` mirrors the image/music GM-only gate.
 * The endpoint exists to feed inputs into the GM-gated /image and /music
 * routes; authorising members would burn LLM budget on an unusable draft.
 */
describe('AI prompt-assist RBAC — POST /ai/prompt-assist', () => {
  it('Player member → 403', async () => {
    const app = makeApp();
    const token = makeAccessToken(PLAYER_ID);

    const res = await request(app)
      .post('/ai/prompt-assist')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: ROOM_ID, target: 'image', userPrompt: 'a wounded knight at dawn' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe(403);
  });

  it('Non-member outsider → 403', async () => {
    const app = makeApp();
    const token = makeAccessToken(OUTSIDER_ID);

    const res = await request(app)
      .post('/ai/prompt-assist')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: ROOM_ID, target: 'music', userPrompt: 'tense cave exploration' });

    expect(res.status).toBe(403);
  });

  it('GM owner → 200 + { draft }', async () => {
    const app = makeApp();
    const token = makeAccessToken(GM_ID);

    const res = await request(app)
      .post('/ai/prompt-assist')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: ROOM_ID, target: 'image', userPrompt: 'a wounded knight at dawn' });

    expect(res.status).toBe(200);
    expect(res.body?.draft).toBe('IMAGE PROMPT: stub');
  });

  it('Missing token → 401', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/ai/prompt-assist')
      .send({ roomId: ROOM_ID, target: 'image', userPrompt: 'no auth' });

    expect(res.status).toBe(401);
  });

  it('GM with invalid target → 400 ai_invalid_prompt', async () => {
    const app = makeApp();
    const token = makeAccessToken(GM_ID);

    const res = await request(app)
      .post('/ai/prompt-assist')
      .set('Authorization', `Bearer ${token}`)
      .send({ roomId: ROOM_ID, target: 'video', userPrompt: 'something' });

    expect(res.status).toBe(400);
    expect(res.body?.error?.kind).toBe('ai_invalid_prompt');
  });
});
