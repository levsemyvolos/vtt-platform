/**
 * Wave 6.5.3 — Integration tests for lenient/idempotent logout (R2-BUG-006).
 *
 * Verifies that:
 *  - Successful logout with valid Bearer token → 204 + session deleted.
 *  - Repeated logout (idempotent) → 204 (session already gone, no 500).
 *  - Logout with expired/malformed token → 204 (lenient, not 401/503).
 *  - Logout with no token at all → 204 (lenient).
 *  - Logout with body.sessionId fallback → 204 + session deleted.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env['JWT_SECRET'] as string;

// ---------------------------------------------------------------------------
// Mock prisma used by SessionRepository inside auth.ts
// vi.hoisted() so the variables are available inside the vi.mock factory.
// ---------------------------------------------------------------------------
const { mockDelete, mockFindFirst } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockFindFirst: vi.fn(),
}));

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    session: {
      delete: mockDelete,
      findFirst: mockFindFirst,
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

import { authRouter } from '../../src/routes/auth.js';

// ---------------------------------------------------------------------------
// Test app
// ---------------------------------------------------------------------------
function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

function makeValidToken(sessionId: string): string {
  return jwt.sign(
    { sub: 'user-123', sid: sessionId, role: 'Player' },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

function makeExpiredToken(sessionId: string): string {
  return jwt.sign(
    { sub: 'user-123', sid: sessionId, role: 'Player' },
    JWT_SECRET,
    { expiresIn: '0s' },
  );
}

describe('POST /auth/logout — R2-BUG-006 lenient & idempotent', () => {
  beforeEach(() => {
    mockDelete.mockReset();
    mockFindFirst.mockReset();
  });

  it('valid Bearer token → 204 and session deleted', async () => {
    mockDelete.mockResolvedValue({ id: 'sess-abc' });
    const token = makeValidToken('sess-abc');
    const app = makeApp();

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalled();
  });

  it('idempotent — session already deleted (Prisma "not found") → still 204', async () => {
    // Simulate Prisma throwing "Record not found" (P2025)
    mockDelete.mockRejectedValue(Object.assign(new Error('Record not found'), { code: 'P2025' }));
    const token = makeValidToken('sess-already-gone');
    const app = makeApp();

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('expired token → 204 (lenient, no 401/503)', async () => {
    mockDelete.mockResolvedValue({ id: 'sess-expired' });
    const token = makeExpiredToken('sess-expired');
    const app = makeApp();

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });

  it('malformed token → 204 (lenient)', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/auth/logout')
      .set('Authorization', 'Bearer not-a-jwt-at-all');

    expect(res.status).toBe(204);
  });

  it('no Authorization header → 204 (lenient)', async () => {
    const app = makeApp();

    const res = await request(app)
      .post('/auth/logout');

    expect(res.status).toBe(204);
  });

  it('body.sessionId fallback → 204 + session deleted', async () => {
    mockDelete.mockResolvedValue({ id: 'sess-from-body' });
    const app = makeApp();

    const res = await request(app)
      .post('/auth/logout')
      .send({ sessionId: 'sess-from-body' });

    expect(res.status).toBe(204);
    expect(mockDelete).toHaveBeenCalled();
  });
});
