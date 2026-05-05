/**
 * Unit test — scene:flush handler broadcasts `annotations:updated` to OTHER clients.
 *
 * Covers Sess 2.5 Mini-B: objects[] transforms buffered during Edit Scene must be
 * propagated to other clients on Done (scene:flush), not just fog + draw strokes.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDrawHandlers } from '../../src/socketio/handlers/draw.js';
import type { SceneAnnotations } from '@vtt/shared';

const ROOM_ID = 'room-1';
const SCENE_ID = 'scene-abc';

function makeAnnotations(overrides?: Partial<SceneAnnotations>): SceneAnnotations {
  return {
    strokes: [],
    texts: [],
    images: [{ id: 'img-1', userId: 'u1', x: 50, y: 80, assetId: 'asset-1', width: 200, height: 150, rotation: 45 }],
    objects: [{ id: 'img-1', type: 'image', userId: 'u1', x: 50, y: 80, zIndex: 0, assetId: 'asset-1', width: 200, height: 150, rotation: 45 }],
    ...overrides,
  };
}

function makeDrawService(annotations = makeAnnotations()) {
  return {
    setFogShapes: vi.fn().mockResolvedValue(undefined),
    persist: vi.fn().mockImplementation(async () => {
      // After persist(), getAnnotations() returns the normalized version.
      // Simulate the cache update by making getAnnotations return the persisted value.
    }),
    getAnnotations: vi.fn().mockResolvedValue(annotations),
  };
}

/**
 * Simulates EventEmitter-style socket with handler registration,
 * so we can trigger `scene:flush` programmatically.
 */
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
  return { to: vi.fn().mockReturnValue({ emit: vi.fn() }) };
}

async function triggerSceneFlush(
  socket: ReturnType<typeof makeSocket>['socket'],
  handlers: ReturnType<typeof makeSocket>['handlers'],
  payload: unknown,
) {
  const handler = handlers['scene:flush'];
  if (!handler) throw new Error('scene:flush handler not registered');
  await handler(payload);
}

describe('scene:flush → annotations:updated broadcast', () => {
  beforeEach(() => vi.clearAllMocks());

  it('emits annotations:updated to OTHER clients after persist', async () => {
    const persistedAnnotations = makeAnnotations();
    const drawService = makeDrawService(persistedAnnotations);
    const { socket, handlers, broadcastEmits } = makeSocket('GM');
    const io = makeIo();

    registerDrawHandlers(io as never, socket as never, drawService as never);

    const flushPayload = {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    };

    await triggerSceneFlush(socket, handlers, flushPayload);

    const annotationsEvent = broadcastEmits.find((e) => e.event === 'annotations:updated');
    expect(annotationsEvent).toBeDefined();
    expect(annotationsEvent?.payload).toMatchObject({
      sceneId: SCENE_ID,
      annotations: persistedAnnotations,
    });
  });

  it('calls drawService.getAnnotations after persist to read normalized state', async () => {
    const persistedAnnotations = makeAnnotations();
    const drawService = makeDrawService(persistedAnnotations);
    const { socket, handlers } = makeSocket('GM');
    const io = makeIo();

    registerDrawHandlers(io as never, socket as never, drawService as never);

    await triggerSceneFlush(socket, handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    expect(drawService.persist).toHaveBeenCalledOnce();
    expect(drawService.getAnnotations).toHaveBeenCalledWith(SCENE_ID);
  });

  it('does NOT emit annotations:updated when not a GM (RBAC guard)', async () => {
    const drawService = makeDrawService();
    const { socket, handlers, broadcastEmits } = makeSocket('Player');
    const io = makeIo();

    registerDrawHandlers(io as never, socket as never, drawService as never);

    await triggerSceneFlush(socket, handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    expect(broadcastEmits.find((e) => e.event === 'annotations:updated')).toBeUndefined();
    expect(drawService.persist).not.toHaveBeenCalled();
  });

  it('uses socket.broadcast.to(roomId) — excludes sender from annotations:updated', async () => {
    const persistedAnnotations = makeAnnotations();
    const drawService = makeDrawService(persistedAnnotations);
    const { socket, handlers } = makeSocket('GM');
    const io = makeIo();

    registerDrawHandlers(io as never, socket as never, drawService as never);

    await triggerSceneFlush(socket, handlers, {
      roomId: ROOM_ID,
      sceneId: SCENE_ID,
      shapes: [],
      annotations: makeAnnotations(),
    });

    // socket.broadcast.to should have been called with the room (not io.to, which includes sender)
    expect(socket.broadcast.to).toHaveBeenCalledWith(ROOM_ID);
  });
});
