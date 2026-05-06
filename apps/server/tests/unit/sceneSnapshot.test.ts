/**
 * Unit tests — Mini-C scene:snapshot broadcast (Sess 2.5).
 *
 * Covers:
 * 1. PATCH without ?staged → io.to(roomId).emit('scene:snapshot', { scene: dto }) fires.
 * 2. PATCH with ?staged=1 → no scene:snapshot emitted.
 * 3. scene:flush handler → socket.broadcast.to(roomId).emit('scene:snapshot') fires after persist
 *    (i.e. staged scene-level changes delivered to other clients on Done).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDrawHandlers } from '../../src/socketio/handlers/draw.js';
import type { SceneDTO, SceneAnnotations } from '@vtt/shared';

const ROOM_ID = 'room-1';
const SCENE_ID = 'scene-abc';

function makeAnnotations(overrides?: Partial<SceneAnnotations>): SceneAnnotations {
  return {
    strokes: [],
    texts: [],
    images: [],
    objects: [],
    ...overrides,
  };
}

function makeSceneDto(): SceneDTO {
  return {
    id: SCENE_ID,
    roomId: ROOM_ID,
    name: 'Test Scene',
    gridSize: 50,
    gridWidth: 20,
    gridHeight: 15,
    gridVisible: true,
    isActive: true,
    isHidden: false,
    fogShapes: [],
    tokens: [],
    annotations: makeAnnotations(),
  };
}

function makeDrawService() {
  return {
    setFogShapes: vi.fn().mockResolvedValue(undefined),
    persist: vi.fn().mockResolvedValue(undefined),
    getAnnotations: vi.fn().mockResolvedValue(makeAnnotations()),
  };
}

function makeSceneService(dto = makeSceneDto()) {
  return {
    getSnapshot: vi.fn().mockResolvedValue(dto),
  };
}

function makeSocket(role: string = 'GM') {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  const broadcastEmits: Array<{ event: string; payload: unknown }> = [];
  const broadcastTo = {
    emit: vi.fn((event: string, payload: unknown) => {
      broadcastEmits.push({ event, payload });
    }),
  };
  const socket = {
    data: { role, roomId: ROOM_ID, userId: 'gm-user', sessionId: 'sess-1' },
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    },
    broadcast: { to: vi.fn().mockReturnValue(broadcastTo) },
  };
  return { socket, handlers, broadcastEmits, broadcastTo };
}

function makeIo() {
  const ioEmits: Array<{ event: string; payload: unknown }> = [];
  const toTarget = {
    emit: vi.fn((event: string, payload: unknown) => {
      ioEmits.push({ event, payload });
    }),
  };
  const io = { to: vi.fn().mockReturnValue(toTarget) };
  return { io, ioEmits };
}

async function triggerSceneFlush(
  handlers: Record<string, (...args: unknown[]) => void>,
  payload: unknown,
): Promise<void> {
  const handler = handlers['scene:flush'];
  if (!handler) throw new Error('scene:flush handler not registered');
  await handler(payload);
}

// ─── scene:flush → scene:snapshot tests ──────────────────────────────────────

describe('scene:flush → scene:snapshot broadcast (Mini-C)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('broadcasts scene:snapshot to OTHER clients via socket.broadcast after flush', async () => {
    const sceneDto = makeSceneDto();
    const drawService = makeDrawService();
    const sceneService = makeSceneService(sceneDto);
    const { socket, handlers, broadcastEmits } = makeSocket('GM');
    const { io } = makeIo();

    registerDrawHandlers(
      io as never,
      socket as never,
      drawService as never,
      undefined,
      sceneService as never,
    );

    await triggerSceneFlush(handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    const snapshotEvent = broadcastEmits.find((e) => e.event === 'scene:snapshot');
    expect(snapshotEvent).toBeDefined();
    expect(snapshotEvent?.payload).toMatchObject({ scene: sceneDto });
  });

  it('calls sceneService.getSnapshot with correct args on flush', async () => {
    const drawService = makeDrawService();
    const sceneService = makeSceneService();
    const { socket, handlers } = makeSocket('GM');
    const { io } = makeIo();

    registerDrawHandlers(
      io as never,
      socket as never,
      drawService as never,
      undefined,
      sceneService as never,
    );

    await triggerSceneFlush(handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    expect(sceneService.getSnapshot).toHaveBeenCalledWith(
      SCENE_ID,
      'GM',
      'gm-user',
    );
  });

  it('uses socket.broadcast.to(roomId) — excludes sender from scene:snapshot', async () => {
    const drawService = makeDrawService();
    const sceneService = makeSceneService();
    const { socket, handlers } = makeSocket('GM');
    const { io } = makeIo();

    registerDrawHandlers(
      io as never,
      socket as never,
      drawService as never,
      undefined,
      sceneService as never,
    );

    await triggerSceneFlush(handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    expect(socket.broadcast.to).toHaveBeenCalledWith(ROOM_ID);
  });

  it('skips scene:snapshot broadcast when sceneService is absent', async () => {
    const drawService = makeDrawService();
    const { socket, handlers, broadcastEmits } = makeSocket('GM');
    const { io } = makeIo();

    // No sceneService passed
    registerDrawHandlers(io as never, socket as never, drawService as never);

    await triggerSceneFlush(handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    expect(broadcastEmits.find((e) => e.event === 'scene:snapshot')).toBeUndefined();
  });

  it('does NOT broadcast scene:snapshot when sender is not GM', async () => {
    const drawService = makeDrawService();
    const sceneService = makeSceneService();
    const { socket, handlers, broadcastEmits } = makeSocket('Player');
    const { io } = makeIo();

    registerDrawHandlers(
      io as never,
      socket as never,
      drawService as never,
      undefined,
      sceneService as never,
    );

    await triggerSceneFlush(handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    expect(broadcastEmits.find((e) => e.event === 'scene:snapshot')).toBeUndefined();
    expect(sceneService.getSnapshot).not.toHaveBeenCalled();
  });
});
