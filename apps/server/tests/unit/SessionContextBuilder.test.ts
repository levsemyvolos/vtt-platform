import { describe, it, expect, vi } from 'vitest';
import { SessionContextBuilder } from '../../src/services/SessionContextBuilder.js';
import type { SceneService } from '../../src/services/SceneService.js';
import type { InitiativeService } from '../../src/services/InitiativeService.js';
import type { CharacterService } from '../../src/services/CharacterService.js';
import type { ChatMessageRepository } from '../../src/repositories/ChatMessageRepository.js';
import type { RoomRepository } from '../../src/repositories/RoomRepository.js';

const ROOM = '11111111-1111-1111-1111-111111111111';
const GM = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAYER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SCENE = 'ssssssss-ssss-ssss-ssss-ssssssssssss';

interface SetupOverrides {
  scene?: { id: string; name: string; description?: string } | null;
  initEntries?: Array<{ id?: string; orderIndex: number; initiative: number; name: string; isCurrent?: boolean; tokenId?: string; characterId?: string }>;
  initRound?: number;
  characters?: Array<{ id: string; name: string; kind: 'full' | 'short'; sheetData?: { class?: string; level?: number }; ownerId?: string; roomId?: string; updatedAt?: string }>;
  chat?: Array<{ id: string; roomId: string; senderId: string | null; body: string; mode?: string; rollPayload?: unknown; recipientId?: string | null; createdAt: Date }>;
  isMember?: boolean;
}

function setup(overrides: SetupOverrides = {}): SessionContextBuilder {
  const scenes = {
    getActiveSnapshot: vi.fn().mockResolvedValue(
      overrides.scene !== undefined ? overrides.scene : { id: SCENE, name: 'Test Scene' },
    ),
  } as unknown as SceneService;

  const rawEntries = overrides.initEntries ?? [];
  const initiative = {
    getSnapshot: vi.fn().mockResolvedValue({
      entries: rawEntries.map((e, i) => ({
        id: e.id ?? `entry-${i}`,
        name: e.name,
        initiative: e.initiative,
        orderIndex: e.orderIndex,
        isCurrent: e.isCurrent ?? false,
        tokenId: e.tokenId,
        characterId: e.characterId,
      })),
      currentRound: overrides.initRound ?? 1,
    }),
  } as unknown as InitiativeService;

  const characters = {
    listForViewer: vi.fn().mockResolvedValue(
      (overrides.characters ?? []).map((c) =>
        c.kind === 'full'
          ? { kind: 'full', id: c.id, name: c.name, ownerId: c.ownerId ?? GM, roomId: c.roomId ?? ROOM, sheetData: c.sheetData ?? {}, updatedAt: c.updatedAt ?? '' }
          : { kind: 'short', id: c.id, name: c.name, ownerId: c.ownerId ?? GM },
      ),
    ),
  } as unknown as CharacterService;

  const chatRepo = {
    listRecent: vi.fn().mockResolvedValue(overrides.chat ?? []),
  } as unknown as ChatMessageRepository;

  const roomRepo = {
    findById: vi.fn().mockResolvedValue({ id: ROOM, ownerId: GM }),
    isMember: vi.fn().mockResolvedValue(overrides.isMember ?? true),
  } as unknown as RoomRepository;

  return new SessionContextBuilder(scenes, initiative, characters, chatRepo, roomRepo);
}

describe('SessionContextBuilder (Session 5.1)', () => {
  it('builds full context for GM: scene + initiative + characters + chat', async () => {
    const builder = setup({
      initEntries: [
        { orderIndex: 0, initiative: 18, name: 'Wizard', isCurrent: true },
        { orderIndex: 1, initiative: 14, name: 'Barbarian', isCurrent: false },
      ],
      initRound: 1,
      characters: [
        { id: 'c1', name: 'Гандальф', kind: 'full', sheetData: { class: 'Wizard', level: 5 } },
        { id: 'c2', name: 'Торін', kind: 'full', sheetData: { class: 'Barbarian', level: 5 } },
      ],
      chat: [
        { id: 'm1', roomId: ROOM, senderId: GM, body: 'GM message', mode: 'text', rollPayload: null, recipientId: null, createdAt: new Date('2026-05-08T10:00:00Z') },
        { id: 'm2', roomId: ROOM, senderId: PLAYER, body: 'Player reply', mode: 'text', rollPayload: null, recipientId: null, createdAt: new Date('2026-05-08T10:01:00Z') },
      ],
    });
    const out = await builder.build(ROOM, GM);
    expect(out).toContain('**Поточна сцена:** Test Scene');
    expect(out).toContain('**Ініціатива:** раунд 1');
    expect(out).toContain('Wizard');
    expect(out).toContain('**Персонажі гравців:**');
    expect(out).toContain('Гандальф (Wizard 5)');
    expect(out).toContain('**Останні дії в чаті:**');
    expect(out).toContain('GM message');
    expect(out).toContain('Player reply');
  });

  it('omits initiative section when no active scene', async () => {
    const builder = setup({
      scene: null,
      initEntries: [{ orderIndex: 0, initiative: 18, name: 'X', isCurrent: true }],
    });
    const out = await builder.build(ROOM, GM);
    expect(out).not.toContain('**Поточна сцена:**');
    expect(out).not.toContain('**Ініціатива:**');
  });

  it('truncates least-important section when over maxChars cap', async () => {
    const longChat = Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      roomId: ROOM,
      senderId: GM,
      body: 'A'.repeat(150),
      mode: 'text',
      rollPayload: null,
      recipientId: null,
      createdAt: new Date(`2026-05-08T10:0${i}:00Z`),
    }));
    const builder = setup({
      chat: longChat,
      characters: [{ id: 'c1', name: 'Char', kind: 'short' }],
    });
    const out = await builder.build(ROOM, GM, { maxChars: 200 });
    // Scene section is preserved; chat (lowest priority) gets dropped.
    expect(out).toContain('**Поточна сцена:**');
    expect(out).not.toContain('**Останні дії в чаті:**');
  });

  it('returns empty string when nothing to show', async () => {
    const builder = setup({ scene: null, initEntries: [], characters: [], chat: [] });
    const out = await builder.build(ROOM, GM);
    expect(out).toBe('');
  });
});
