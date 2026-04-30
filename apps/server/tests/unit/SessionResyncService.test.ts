import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatMessage, InitiativeEntry } from '@prisma/client';
import { SessionResyncService } from '../../src/services/SessionResyncService.js';
import type { SceneService } from '../../src/services/SceneService.js';
import type { ChatMessageRepository } from '../../src/repositories/ChatMessageRepository.js';
import type { InitiativeRepository } from '../../src/repositories/InitiativeRepository.js';

const sceneSnapshot = {
  id: 'scene-1',
  roomId: 'room-1',
  name: 'Tavern',
  gridSize: 50,
  gridWidth: 40,
  gridHeight: 40,
  isActive: true,
  isHidden: false,
  fogMaskBase64: null,
  tokens: [],
};

function makeSceneService(): SceneService {
  return {
    getActiveSnapshot: vi.fn().mockResolvedValue(sceneSnapshot),
  } as unknown as SceneService;
}

function makeChatRepo(messages: ChatMessage[] = []): ChatMessageRepository {
  return {
    listRecent: vi.fn().mockResolvedValue(messages),
  } as unknown as ChatMessageRepository;
}

function makeInitiativeRepo(entries: InitiativeEntry[] = []): InitiativeRepository {
  return {
    listByScene: vi.fn().mockResolvedValue(entries),
  } as unknown as InitiativeRepository;
}

const broadcastMessage: ChatMessage = {
  id: 'msg-1',
  roomId: 'room-1',
  senderId: 'user-A',
  mode: 'normal',
  body: 'hello room',
  rollPayload: null,
  recipientId: null,
  createdAt: new Date('2026-04-30T10:00:00Z'),
};

const whisperToB: ChatMessage = {
  id: 'msg-2',
  roomId: 'room-1',
  senderId: 'user-A',
  mode: 'whisper',
  body: 'psst',
  rollPayload: null,
  recipientId: 'user-B',
  createdAt: new Date('2026-04-30T10:01:00Z'),
};

const secretRoll: ChatMessage = {
  id: 'msg-3',
  roomId: 'room-1',
  senderId: 'user-A',
  mode: 'secret_roll',
  body: '1d20',
  rollPayload: { expression: '1d20', total: 17, rolls: [17], mode: 'secret' },
  recipientId: null,
  createdAt: new Date('2026-04-30T10:02:00Z'),
};

describe('SessionResyncService.buildResyncPayload (algorithm A3, §2.17.4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('happy path: returns scene + messages + initiatives + serverTime', async () => {
    const svc = new SessionResyncService(
      makeSceneService(),
      makeInitiativeRepo([
        {
          id: 'init-1',
          sceneId: 'scene-1',
          name: 'Hero',
          initiative: 18,
          orderIndex: 0,
          isCurrent: true,
        },
      ]),
      makeChatRepo([broadcastMessage]),
    );
    const start = Date.now();
    const payload = await svc.buildResyncPayload('room-1', 'GM', 'user-gm');
    expect(payload.scene.id).toBe('scene-1');
    expect(payload.messages).toHaveLength(1);
    expect(payload.initiatives[0]?.name).toBe('Hero');
    expect(payload.serverTime).toBeGreaterThanOrEqual(start);
  });

  it('non-recipient does NOT see whispered messages addressed to someone else', async () => {
    const svc = new SessionResyncService(
      makeSceneService(),
      makeInitiativeRepo(),
      makeChatRepo([whisperToB]),
    );
    const payload = await svc.buildResyncPayload('room-1', 'Player', 'user-C');
    expect(payload.messages).toHaveLength(0);
  });

  it('whisper recipient sees the whisper', async () => {
    const svc = new SessionResyncService(
      makeSceneService(),
      makeInitiativeRepo(),
      makeChatRepo([whisperToB]),
    );
    const payload = await svc.buildResyncPayload('room-1', 'Player', 'user-B');
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.id).toBe('msg-2');
  });

  it('secret roll is hidden from non-GM, non-sender viewers', async () => {
    const svc = new SessionResyncService(
      makeSceneService(),
      makeInitiativeRepo(),
      makeChatRepo([secretRoll]),
    );
    const payload = await svc.buildResyncPayload('room-1', 'Player', 'user-Z');
    expect(payload.messages).toHaveLength(0);
  });

  it('secret roll is visible to GM', async () => {
    const svc = new SessionResyncService(
      makeSceneService(),
      makeInitiativeRepo(),
      makeChatRepo([secretRoll]),
    );
    const payload = await svc.buildResyncPayload('room-1', 'GM', 'user-gm');
    expect(payload.messages).toHaveLength(1);
    expect(payload.messages[0]?.rollPayload?.total).toBe(17);
  });

  it('throws 404 when room has no active scene', async () => {
    const sceneService = {
      getActiveSnapshot: vi.fn().mockResolvedValue(null),
    } as unknown as SceneService;
    const svc = new SessionResyncService(
      sceneService,
      makeInitiativeRepo(),
      makeChatRepo(),
    );
    await expect(
      svc.buildResyncPayload('room-1', 'Player', 'user-A'),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('NFR 3.2 budget: build completes in ≤100 ms with mocked repos (proxy for ≤10 s real-world)', async () => {
    const svc = new SessionResyncService(
      makeSceneService(),
      makeInitiativeRepo(),
      makeChatRepo([broadcastMessage]),
    );
    const t0 = performance.now();
    await svc.buildResyncPayload('room-1', 'Player', 'user-A');
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100);
  });
});
