/**
 * Moderation handlers — `mod:kick` invariants (Workstream A1 + B5).
 *
 * Guards two regressions:
 *   1. After a successful kick, the target's socket MUST be torn down
 *      (`disconnect(true)`) — not merely emitted-to and `leave()`-d. Without
 *      the hard close any in-flight handler that already captured
 *      `socket.data.role` into a local variable could continue acting on the
 *      room (Plan §A1).
 *   2. The role gate now goes through `auth/policy.can()`, not a hard-coded
 *      `socket.data.role !== 'GM'` comparison (Plan §B5).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    roomMember: {
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({ userId: 't', role: 'Observer', user: { displayName: 'Tgt' } }),
    },
  },
}));

const ROOM_ID = 'room-1';
const GM_ID = 'gm-1';
const TARGET_ID = 'target-1';

function makeTargetSocket() {
  return {
    data: { roomId: ROOM_ID, role: 'Player' },
    emit: vi.fn(),
    leave: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeIo(targetSocket: ReturnType<typeof makeTargetSocket>) {
  return {
    in: vi.fn().mockReturnValue({
      fetchSockets: vi.fn().mockResolvedValue([targetSocket]),
    }),
    to: vi.fn().mockReturnValue({ emit: vi.fn() }),
  };
}

function captureHandlers() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const socket = {
    data: { roomId: ROOM_ID, role: 'GM' },
    on: vi.fn((event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, handler);
    }),
  };
  return { socket, handlers };
}

describe('mod:kick handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hard-disconnects the target socket after a successful kick', async () => {
    const { registerModerationHandlers } = await import(
      '../../src/socketio/handlers/moderation.js'
    );
    const target = makeTargetSocket();
    const io = makeIo(target);
    const { socket, handlers } = captureHandlers();
    registerModerationHandlers(io as never, socket as never);

    const ack = vi.fn();
    await handlers.get('mod:kick')!(
      { roomId: ROOM_ID, targetUserId: TARGET_ID } as never,
      ack as never,
    );

    expect(target.emit).toHaveBeenCalledWith('room:kicked', { roomId: ROOM_ID });
    expect(target.leave).toHaveBeenCalledWith(ROOM_ID);
    expect(target.disconnect).toHaveBeenCalledWith(true);
    expect(target.data).not.toHaveProperty('roomId');
    expect(target.data).not.toHaveProperty('role');
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it('rejects with 403 when caller is not GM (policy.can gate)', async () => {
    const { registerModerationHandlers } = await import(
      '../../src/socketio/handlers/moderation.js'
    );
    const target = makeTargetSocket();
    const io = makeIo(target);
    const { socket, handlers } = captureHandlers();
    socket.data.role = 'Player';
    registerModerationHandlers(io as never, socket as never);

    const ack = vi.fn();
    await handlers.get('mod:kick')!(
      { roomId: ROOM_ID, targetUserId: TARGET_ID } as never,
      ack as never,
    );

    expect(target.disconnect).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 403 }) }),
    );
  });

  it('rejects with 403 when target room differs from socket room', async () => {
    const { registerModerationHandlers } = await import(
      '../../src/socketio/handlers/moderation.js'
    );
    const target = makeTargetSocket();
    const io = makeIo(target);
    const { socket, handlers } = captureHandlers();
    registerModerationHandlers(io as never, socket as never);

    const ack = vi.fn();
    await handlers.get('mod:kick')!(
      { roomId: 'other-room', targetUserId: TARGET_ID } as never,
      ack as never,
    );

    expect(target.disconnect).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, error: expect.objectContaining({ code: 403 }) }),
    );
  });

  it('does not disconnect a same-user socket attached to a different room', async () => {
    const { registerModerationHandlers } = await import(
      '../../src/socketio/handlers/moderation.js'
    );
    const sameUserOtherRoom = {
      data: { roomId: 'other-room', role: 'Player' },
      emit: vi.fn(),
      leave: vi.fn(),
      disconnect: vi.fn(),
    };
    const io = {
      in: vi.fn().mockReturnValue({
        fetchSockets: vi.fn().mockResolvedValue([sameUserOtherRoom]),
      }),
      to: vi.fn().mockReturnValue({ emit: vi.fn() }),
    };
    const { socket, handlers } = captureHandlers();
    registerModerationHandlers(io as never, socket as never);

    const ack = vi.fn();
    await handlers.get('mod:kick')!(
      { roomId: ROOM_ID, targetUserId: TARGET_ID } as never,
      ack as never,
    );

    expect(sameUserOtherRoom.disconnect).not.toHaveBeenCalled();
    expect(sameUserOtherRoom.leave).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });
});
