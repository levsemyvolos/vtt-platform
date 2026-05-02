import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawService } from '../../src/services/DrawService.js';
import type { DrawBroadcast } from '../../src/services/DrawService.js';
import type { DrawStrokePayload } from '@vtt/shared';

const SCENE_ID = 'scene-1';
const ROOM_ID = 'room-1';
const USER_ID = 'user-1';

function makeStrokePayload(overrides?: Partial<DrawStrokePayload>): DrawStrokePayload {
  return {
    roomId: ROOM_ID,
    sceneId: SCENE_ID,
    strokeId: 'stroke-abc',
    userId: USER_ID,
    points: [0, 0, 10, 10, 20, 5],
    color: '#ef4444',
    width: 3,
    ...overrides,
  };
}

function makePrisma(existingAnnotations: unknown[] = []) {
  return {
    scene: {
      findUnique: vi.fn().mockResolvedValue({ annotations: existingAnnotations }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
}

function makeBroadcast(): { broadcast: DrawBroadcast; strokeFn: ReturnType<typeof vi.fn>; clearFn: ReturnType<typeof vi.fn> } {
  const strokeFn = vi.fn();
  const clearFn = vi.fn();
  return { broadcast: { stroke: strokeFn, clear: clearFn }, strokeFn, clearFn };
}

describe('DrawService.addStroke', () => {
  beforeEach(() => vi.clearAllMocks());

  it('persists the stroke and broadcasts to the room', async () => {
    const prisma = makePrisma([]);
    const { broadcast, strokeFn } = makeBroadcast();
    const svc = new DrawService(prisma as never, broadcast);
    const payload = makeStrokePayload();

    await svc.addStroke(payload);

    expect(prisma.scene.update).toHaveBeenCalledOnce();
    const updateArg = prisma.scene.update.mock.calls[0][0];
    expect(updateArg.where.id).toBe(SCENE_ID);
    expect(Array.isArray(updateArg.data.annotations)).toBe(true);
    expect(updateArg.data.annotations).toHaveLength(1);
    expect(updateArg.data.annotations[0].strokeId).toBe('stroke-abc');

    expect(strokeFn).toHaveBeenCalledWith(ROOM_ID, payload);
  });

  it('upserts when strokeId already exists (idempotent)', async () => {
    const existing = [{ strokeId: 'stroke-abc', userId: USER_ID, points: [0, 0], color: '#000', width: 1 }];
    const prisma = makePrisma(existing);
    const { broadcast } = makeBroadcast();
    const svc = new DrawService(prisma as never, broadcast);

    await svc.addStroke(makeStrokePayload({ color: '#ff0000', points: [1, 2, 3, 4] }));

    const updateArg = prisma.scene.update.mock.calls[0][0];
    expect(updateArg.data.annotations).toHaveLength(1);
    expect(updateArg.data.annotations[0].color).toBe('#ff0000');
  });

  it('caches strokes — second stroke does not re-query the DB', async () => {
    const prisma = makePrisma([]);
    const { broadcast } = makeBroadcast();
    const svc = new DrawService(prisma as never, broadcast);

    await svc.addStroke(makeStrokePayload({ strokeId: 's1' }));
    await svc.addStroke(makeStrokePayload({ strokeId: 's2' }));

    expect(prisma.scene.findUnique).toHaveBeenCalledOnce();
    const lastUpdate = prisma.scene.update.mock.calls[1][0];
    expect(lastUpdate.data.annotations).toHaveLength(2);
  });
});

describe('DrawService.clearStrokes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resets the JSONB to an empty array and broadcasts clear', async () => {
    const prisma = makePrisma([{ strokeId: 's1', userId: USER_ID, points: [], color: '#000', width: 1 }]);
    const { broadcast, clearFn } = makeBroadcast();
    const svc = new DrawService(prisma as never, broadcast);

    await svc.clearStrokes(ROOM_ID, SCENE_ID);

    const updateArg = prisma.scene.update.mock.calls[0][0];
    expect(updateArg.data.annotations).toEqual([]);
    expect(clearFn).toHaveBeenCalledWith(ROOM_ID, SCENE_ID);
  });
});
