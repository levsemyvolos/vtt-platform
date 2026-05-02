import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import type { RoomRepository } from '../../src/repositories/RoomRepository.js';
import { requireRoomGM } from '../../src/middleware/requireRoomGM.js';

function makeRoomRepo(role: 'GM' | 'Player' | null): RoomRepository {
  return {
    getRoleInRoom: vi.fn().mockResolvedValue(role),
  } as unknown as RoomRepository;
}

function makeReq(
  userId: string,
  body: Record<string, unknown> = {},
): Partial<Request> {
  return {
    user: { id: userId, role: 'Player' } as Request['user'],
    body,
    query: {},
    params: {},
  };
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, json, status };
}

describe('requireRoomGM middleware', () => {
  it('GM owner — calls next()', async () => {
    const repo = makeRoomRepo('GM');
    const middleware = requireRoomGM(repo);
    const req = makeReq('user-gm', { roomId: 'room-1' });
    const { res } = makeRes();
    const next = vi.fn() as NextFunction;

    await middleware(req as Request, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('Player member — returns 403', async () => {
    const repo = makeRoomRepo('Player');
    const middleware = requireRoomGM(repo);
    const req = makeReq('user-player', { roomId: 'room-1' });
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;

    await middleware(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 403 }) }),
    );
  });

  it('non-member (null role) — returns 403', async () => {
    const repo = makeRoomRepo(null);
    const middleware = requireRoomGM(repo);
    const req = makeReq('user-stranger', { roomId: 'room-1' });
    const { res, status, json } = makeRes();
    const next = vi.fn() as NextFunction;

    await middleware(req as Request, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 403 }) }),
    );
  });
});
