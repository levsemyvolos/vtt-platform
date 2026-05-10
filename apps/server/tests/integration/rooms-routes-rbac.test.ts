/**
 * Rooms routes — RBAC guard integration (Workstream A2/A3/A4 of the
 * RBAC-рефакторинг plan).
 *
 * What this asserts:
 *   1. POST /rooms/join                  → 403 for Observer JWT (A4 — Observer
 *      cannot infiltrate as Player via player invite token).
 *   2. POST /rooms/:id/invites           → 403 for Observer JWT bound to a
 *      different room (A3 — `requireBoundRoom` on the invite issuer).
 *   3. GET  /rooms/:id/members           → 403 for Observer JWT bound to a
 *      different room (A2 — `requireBoundRoom` on the member roster).
 *
 * The router instantiates `prisma` at module load time; we mock the Prisma
 * client with empty stubs, because the middleware short-circuits BEFORE any
 * service or repository code runs. If a guard regresses and the request
 * reaches the service layer, the stub will surface as a 500 / undefined call
 * — surfacing the regression loudly.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    room: { findUnique: vi.fn(), findMany: vi.fn() },
    roomMember: { findFirst: vi.fn(), findMany: vi.fn() },
    character: { findMany: vi.fn() },
    user: { create: vi.fn() },
  },
}));

const JWT_SECRET = process.env['JWT_SECRET'] as string;
const ROOM_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ROOM_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function observerToken(boundRoomId: string): string {
  return jwt.sign(
    { sub: USER_ID, role: 'Observer', sid: 'sid-obs', boundRoomId },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

function playerToken(): string {
  return jwt.sign(
    { sub: USER_ID, role: 'Player', sid: 'sid-play' },
    JWT_SECRET,
    { expiresIn: '15m' },
  );
}

let app: express.Express;

beforeAll(async () => {
  // Lazy-import the router AFTER vi.mock has been hoisted.
  const { roomsRouter } = await import('../../src/routes/rooms.js');
  app = express();
  app.use(express.json());
  app.use('/api/rooms', roomsRouter);
});

describe('Rooms routes — RBAC guards', () => {
  it('A4: Observer JWT → POST /rooms/join → 403', async () => {
    const res = await request(app)
      .post('/api/rooms/join')
      .set('Authorization', `Bearer ${observerToken(ROOM_ID)}`)
      .send({ token: 'any-player-token-payload' });

    expect(res.status).toBe(403);
    expect(res.body?.error?.code).toBe(403);
  });

  it('A4: missing JWT → POST /rooms/join → 401', async () => {
    const res = await request(app)
      .post('/api/rooms/join')
      .send({ token: 'x' });

    expect(res.status).toBe(401);
  });

  it('A3: Observer bound to a different room → POST /rooms/:id/invites → 403', async () => {
    const res = await request(app)
      .post(`/api/rooms/${ROOM_ID}/invites`)
      .set('Authorization', `Bearer ${observerToken(OTHER_ROOM_ID)}`)
      .send();

    expect(res.status).toBe(403);
  });

  it('A2: Observer bound to a different room → GET /rooms/:id/members → 403', async () => {
    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/members`)
      .set('Authorization', `Bearer ${observerToken(OTHER_ROOM_ID)}`);

    expect(res.status).toBe(403);
  });

  it('A2: Observer bound to the SAME room is permitted past requireBoundRoom', async () => {
    // The guard passes; the stubbed service returns 404/500 below it. Either
    // way, the response status MUST NOT be 401/403 — that proves the guard
    // accepted the matching boundRoomId. We accept any 4xx/5xx other than 401/403.
    const res = await request(app)
      .get(`/api/rooms/${ROOM_ID}/members`)
      .set('Authorization', `Bearer ${observerToken(ROOM_ID)}`);

    expect([401, 403]).not.toContain(res.status);
  });

  it('A4: Player JWT is permitted past requireRole on POST /rooms/join', async () => {
    // Player passes the guard; service-layer 404 (invalid token) is expected.
    const res = await request(app)
      .post('/api/rooms/join')
      .set('Authorization', `Bearer ${playerToken()}`)
      .send({ token: 'invalid-but-syntactically-valid' });

    expect([401, 403]).not.toContain(res.status);
  });
});
