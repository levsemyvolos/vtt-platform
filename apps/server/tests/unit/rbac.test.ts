/**
 * Unit tests for RBAC middleware: requireRole + requireBoundRoom.
 * Covers Wave 1.2 Observer scope-binding per §2.18.2.
 */
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { jwtAuth } from '../../src/middleware/jwtAuth.js';
import { requireRole } from '../../src/middleware/rbac.js';
import { requireBoundRoom } from '../../src/middleware/requireBoundRoom.js';

// JWT_SECRET is set in tests/setup.ts → 'test-secret-for-unit-tests'
const SECRET = process.env['JWT_SECRET'] as string;

function makeToken(
  payload: Record<string, unknown>,
  expiresIn: number | string = 900,
): string {
  return jwt.sign(payload, SECRET, { expiresIn });
}

/** Build a mock Express Request with Authorization header and optional params */
function makeReq(token: string, params: Record<string, string> = {}): Partial<Request> {
  return {
    headers: { authorization: `Bearer ${token}` },
    params,
    query: {},
    body: {},
    user: undefined,
  };
}

function makeRes() {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as Response, status, json };
}

const next = vi.fn() as NextFunction;

function resetNext(): void {
  vi.mocked(next).mockReset();
}

// ---------------------------------------------------------------------------
// Helper: run jwtAuth + subsequent middleware in sequence (mimicking Express)
// The outer `next` spy is called only when all handlers in the chain call next()
// (i.e., the full chain passes without an early error response).
// ---------------------------------------------------------------------------
async function runChain(
  req: Partial<Request>,
  ...handlers: Array<(req: Request, res: Response, next: NextFunction) => void>
): Promise<{ res: Response; status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> }> {
  const { res, status, json } = makeRes();
  resetNext();

  let idx = 0;
  function runNext(): void {
    const handler = handlers[idx++];
    if (handler) {
      handler(req as Request, res, runNext as NextFunction);
    } else {
      // All handlers passed — call the outer spy to record success
      next();
    }
  }
  runNext();

  // Give micro-tasks a chance to complete (jwtAuth is synchronous but be safe)
  await Promise.resolve();

  return { res, status, json };
}

// ---------------------------------------------------------------------------
// Token factories
// ---------------------------------------------------------------------------
const OBSERVER_ROOM_ID = 'room-bound-111';
const OTHER_ROOM_ID = 'room-other-999';
const USER_ID = 'user-abc';

function observerToken(boundRoomId = OBSERVER_ROOM_ID): string {
  return makeToken({ sub: USER_ID, role: 'Observer', sid: 'sid-obs', boundRoomId });
}

function playerToken(): string {
  return makeToken({ sub: USER_ID, role: 'Player', sid: 'sid-play' });
}

function gmToken(): string {
  return makeToken({ sub: USER_ID, role: 'GM', sid: 'sid-gm' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RBAC — Observer scope restrictions', () => {
  it('Case 1: Observer-token → POST /api/rooms → 403 FORBIDDEN', async () => {
    const token = observerToken();
    const req = makeReq(token);
    const { status, json } = await runChain(
      req,
      jwtAuth,
      requireRole('GM', 'Player'),
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 403 }) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('Case 2: Observer-token → GET /api/rooms (list) → 403 FORBIDDEN', async () => {
    const token = observerToken();
    const req = makeReq(token);
    const { status } = await runChain(
      req,
      jwtAuth,
      requireRole('GM', 'Player'),
    );

    expect(status).toHaveBeenCalledWith(403);
  });

  it('Case 3: Observer-token → GET /api/rooms/<boundRoomId> → passes requireBoundRoom', async () => {
    const token = observerToken(OBSERVER_ROOM_ID);
    const req = makeReq(token, { id: OBSERVER_ROOM_ID });
    const { status } = await runChain(req, jwtAuth, requireBoundRoom);

    // requireBoundRoom must call next() — status() should NOT be called
    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('Case 4: Observer-token → GET /api/rooms/<foreignRoomId> → 403 FORBIDDEN', async () => {
    const token = observerToken(OBSERVER_ROOM_ID);
    const req = makeReq(token, { id: OTHER_ROOM_ID });
    const { status, json } = await runChain(req, jwtAuth, requireBoundRoom);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 403 }) }),
    );
  });

  it('Case 5: Player-token → POST /api/rooms → allowed by requireRole', async () => {
    const token = playerToken();
    const req = makeReq(token);
    const { status } = await runChain(req, jwtAuth, requireRole('GM', 'Player'));

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('Case 5b: GM-token → POST /api/rooms → allowed by requireRole', async () => {
    const token = gmToken();
    const req = makeReq(token);
    const { status } = await runChain(req, jwtAuth, requireRole('GM', 'Player'));

    expect(status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('Case 6 (backward compat): Observer token WITHOUT boundRoomId → requireBoundRoom → 403', async () => {
    // Legacy observer token without boundRoomId baked in — must be rejected for any room
    const legacyToken = makeToken({ sub: USER_ID, role: 'Observer', sid: 'sid-legacy' });
    const req = makeReq(legacyToken, { id: OBSERVER_ROOM_ID });
    const { status } = await runChain(req, jwtAuth, requireBoundRoom);

    // boundRoomId undefined !== OBSERVER_ROOM_ID → 403
    expect(status).toHaveBeenCalledWith(403);
  });
});

describe('RBAC — requireRole unauthenticated guard', () => {
  it('No Authorization header → jwtAuth returns 401', async () => {
    const req: Partial<Request> = { headers: {}, params: {}, query: {}, body: {} };
    const { status } = await runChain(req, jwtAuth, requireRole('GM'));

    expect(status).toHaveBeenCalledWith(401);
  });
});
