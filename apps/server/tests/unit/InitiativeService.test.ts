import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InitiativeEntry, PrismaClient, Scene } from '@prisma/client';
import { InitiativeService } from '../../src/services/InitiativeService.js';
import type { InitiativeRepository } from '../../src/repositories/InitiativeRepository.js';
import type { SceneRepository } from '../../src/repositories/SceneRepository.js';
import { projectInitiative } from '../../src/services/projections.js';

const SCENE_ID = 'scene-1';
const ROOM_ID = 'room-1';

function makeEntry(overrides: Partial<InitiativeEntry>): InitiativeEntry {
  return {
    id: 'e1',
    sceneId: SCENE_ID,
    name: 'Goblin',
    initiative: 10,
    orderIndex: 0,
    isCurrent: false,
    tokenId: null,
    ...overrides,
  };
}

/** Minimal PrismaClient stub — only token.findUnique is needed by InitiativeService. */
function makeDb(): PrismaClient {
  return {
    token: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  } as unknown as PrismaClient;
}

interface RepoState {
  rows: InitiativeEntry[];
}

function makeRepo(state: RepoState): InitiativeRepository {
  return {
    findById: vi.fn(async (id: string) => state.rows.find((r) => r.id === id) ?? null),
    listByScene: vi.fn(async () =>
      [...state.rows].sort((a, b) => {
        if (a.initiative !== b.initiative) return b.initiative - a.initiative;
        return a.orderIndex - b.orderIndex;
      }),
    ),
    create: vi.fn(async (data: {
      id?: string;
      name: string;
      initiative: number;
      orderIndex: number;
      token?: { connect: { id: string } };
    }) => {
      const created = makeEntry({
        id: data.id ?? `gen-${state.rows.length}`,
        name: data.name,
        initiative: data.initiative,
        orderIndex: data.orderIndex,
        tokenId: data.token?.connect.id ?? null,
      });
      state.rows.push(created);
      return created;
    }),
    delete: vi.fn(async (id: string) => {
      state.rows = state.rows.filter((r) => r.id !== id);
    }),
    count: vi.fn(async () => state.rows.length),
    updateOrder: vi.fn(async (_sceneId: string, orderedIds: string[]) => {
      orderedIds.forEach((id, idx) => {
        const row = state.rows.find((r) => r.id === id);
        if (row) row.orderIndex = idx;
      });
    }),
    setCurrent: vi.fn(async (_sceneId: string, entryId: string) => {
      state.rows.forEach((r) => {
        r.isCurrent = r.id === entryId;
      });
    }),
    clearCurrent: vi.fn(async () => {
      state.rows.forEach((r) => {
        r.isCurrent = false;
      });
    }),
    getCurrentIndex: vi.fn(async () => {
      const cur = state.rows.find((r) => r.isCurrent);
      return cur?.orderIndex ?? null;
    }),
  } as unknown as InitiativeRepository;
}

/** Creates a SceneRepository mock backed by shared mutable round state. */
function makeSceneRepo(opts: { initialRound?: number } = {}): SceneRepository {
  let currentRound = opts.initialRound ?? 1;

  const baseScene: Scene = {
    id: SCENE_ID,
    roomId: ROOM_ID,
    name: 'Cave',
    backgroundAssetId: null,
    gridSize: 70,
    gridWidth: 40,
    gridHeight: 40,
    gridVisible: true,
    fogShapes: null,
    isHidden: false,
    isActive: true,
    currentRound,
    createdAt: new Date(),
  };

  return {
    findById: vi.fn().mockResolvedValue({ ...baseScene }),
    getCurrentRound: vi.fn(async () => currentRound),
    incrementRound: vi.fn(async () => {
      currentRound += 1;
      return currentRound;
    }),
    update: vi.fn(async (_id: string, data: { currentRound?: number }) => {
      if (typeof data.currentRound === 'number') {
        currentRound = data.currentRound;
      }
      return { ...baseScene, currentRound };
    }),
  } as unknown as SceneRepository;
}

describe('InitiativeService (Ф7.3)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('addEntry assigns orderIndex = current count (push to end)', async () => {
    const state: RepoState = { rows: [] };
    const svc = new InitiativeService(makeRepo(state), makeSceneRepo(), makeDb());

    const s1 = await svc.addEntry(SCENE_ID, 'Alice', 18);
    const s2 = await svc.addEntry(SCENE_ID, 'Bob', 12);

    expect(s1.entries.find((e) => e.name === 'Alice')?.orderIndex).toBe(0);
    expect(s2.entries.find((e) => e.name === 'Bob')?.orderIndex).toBe(1);
  });

  it('reorder rewrites orderIndex according to orderedIds', async () => {
    const state: RepoState = {
      rows: [
        makeEntry({ id: 'a', name: 'A', initiative: 10, orderIndex: 0 }),
        makeEntry({ id: 'b', name: 'B', initiative: 10, orderIndex: 1 }),
        makeEntry({ id: 'c', name: 'C', initiative: 10, orderIndex: 2 }),
      ],
    };
    const svc = new InitiativeService(makeRepo(state), makeSceneRepo(), makeDb());

    await svc.reorder(SCENE_ID, ['c', 'a', 'b']);

    expect(state.rows.find((r) => r.id === 'c')!.orderIndex).toBe(0);
    expect(state.rows.find((r) => r.id === 'a')!.orderIndex).toBe(1);
    expect(state.rows.find((r) => r.id === 'b')!.orderIndex).toBe(2);
  });

  it('advanceTurn cycles entries and increments currentRound on wrap', async () => {
    const state: RepoState = {
      rows: [
        makeEntry({ id: 'a', name: 'A', initiative: 20, orderIndex: 0 }),
        makeEntry({ id: 'b', name: 'B', initiative: 15, orderIndex: 1 }),
      ],
    };
    const svc = new InitiativeService(makeRepo(state), makeSceneRepo(), makeDb());

    // First call → A becomes current, round = 1.
    const s1 = await svc.advanceTurn(SCENE_ID);
    expect(s1.currentRound).toBe(1);
    expect(s1.entries.find((e) => e.id === 'a')?.isCurrent).toBe(true);

    // Second call → B becomes current, round still 1.
    const s2 = await svc.advanceTurn(SCENE_ID);
    expect(s2.currentRound).toBe(1);
    expect(s2.entries.find((e) => e.id === 'b')?.isCurrent).toBe(true);

    // Third call → wrap to A, round = 2.
    const s3 = await svc.advanceTurn(SCENE_ID);
    expect(s3.currentRound).toBe(2);
    expect(s3.entries.find((e) => e.id === 'a')?.isCurrent).toBe(true);
  });

  it('removeEntry while current → next becomes current', async () => {
    const state: RepoState = {
      rows: [
        makeEntry({ id: 'a', name: 'A', initiative: 20, orderIndex: 0, isCurrent: true }),
        makeEntry({ id: 'b', name: 'B', initiative: 15, orderIndex: 1 }),
        makeEntry({ id: 'c', name: 'C', initiative: 10, orderIndex: 2 }),
      ],
    };
    const svc = new InitiativeService(makeRepo(state), makeSceneRepo(), makeDb());

    const snap = await svc.removeEntry(SCENE_ID, 'a');
    // After removal A is gone; the entry that was at orderIndex 1 (B) takes
    // current — service picks ordered[orderIndex] which is index 0 of the
    // remaining 2 rows (B at orderIndex 1, C at orderIndex 2 → first is B).
    const current = snap.entries.find((e) => e.isCurrent);
    expect(current?.id).toBe('b');
  });

  it('currentRound persists across service restart (mock SceneRepository)', async () => {
    // Two InitiativeService instances share the same SceneRepository,
    // simulating process restart with a persistent DB.
    const state: RepoState = {
      rows: [
        makeEntry({ id: 'a', name: 'A', initiative: 20, orderIndex: 0 }),
        makeEntry({ id: 'b', name: 'B', initiative: 15, orderIndex: 1 }),
      ],
    };
    const repo = makeRepo(state);
    const sceneRepo = makeSceneRepo(); // shared "DB" state

    const svc1 = new InitiativeService(repo, sceneRepo, makeDb());
    await svc1.advanceTurn(SCENE_ID); // A current, round = 1
    await svc1.advanceTurn(SCENE_ID); // B current, round = 1
    const snapBeforeRestart = await svc1.advanceTurn(SCENE_ID); // wrap → A, round = 2
    expect(snapBeforeRestart.currentRound).toBe(2);

    // Simulate restart: new service instance, same shared sceneRepo.
    const svc2 = new InitiativeService(repo, sceneRepo, makeDb());
    const snapAfterRestart = await svc2.getSnapshot(SCENE_ID);
    expect(snapAfterRestart.currentRound).toBe(2); // not reset to 1
  });
});

const TOKEN_ID = 'token-uuid-1';

describe('InitiativeService — tokenId threading', () => {
  beforeEach(() => vi.clearAllMocks());

  it('addEntry with valid same-scene tokenId stores tokenId on the created entry', async () => {
    const state: RepoState = { rows: [] };
    const db: PrismaClient = {
      token: {
        findUnique: vi.fn().mockResolvedValue({ id: TOKEN_ID, sceneId: SCENE_ID }),
      },
    } as unknown as PrismaClient;

    const svc = new InitiativeService(makeRepo(state), makeSceneRepo(), db);
    const snap = await svc.addEntry(SCENE_ID, 'Hero', 15, TOKEN_ID);

    const entry = snap.entries.find((e) => e.name === 'Hero');
    expect(entry).toBeDefined();
    expect(entry!.tokenId).toBe(TOKEN_ID);
  });

  it('addEntry with tokenId from a different scene throws HttpError 400', async () => {
    const state: RepoState = { rows: [] };
    const db: PrismaClient = {
      token: {
        findUnique: vi.fn().mockResolvedValue({ id: TOKEN_ID, sceneId: 'other-scene' }),
      },
    } as unknown as PrismaClient;

    const svc = new InitiativeService(makeRepo(state), makeSceneRepo(), db);
    await expect(svc.addEntry(SCENE_ID, 'Hero', 15, TOKEN_ID)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('projectInitiative omits tokenId property when entry.tokenId is null (FK SET NULL)', () => {
    const entry = makeEntry({ id: 'e-null', name: 'Ghost', initiative: 5, tokenId: null });
    const dto = projectInitiative(entry);

    // tokenId must be entirely absent — not present as undefined or null
    expect(Object.prototype.hasOwnProperty.call(dto, 'tokenId')).toBe(false);
  });
});
