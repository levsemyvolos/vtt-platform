/**
 * Wave 6.5.4 — Integration tests for Zod validation on /auth/register and /auth/login (R2-REG-002).
 *
 * Verifies that:
 *  - Name 200 chars → 400 VALIDATION_FAILED (prevents Prisma VARCHAR overflow → 500).
 *  - Password 200 chars → 400 VALIDATION_FAILED (prevents bcrypt DoS).
 *  - Email 300 chars → 400 VALIDATION_FAILED (prevents DB constraint crash).
 *  - Invalid email format → 400 VALIDATION_FAILED.
 *  - Valid input → handler is reached (mocked to return 201).
 *  - /login password 200 chars → 400 VALIDATION_FAILED.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authRouter } from '../../src/routes/auth.js';

// ---------------------------------------------------------------------------
// Mock AuthService via prisma dependency so handler is never really executed.
// We just need to verify the validation middleware rejects invalid input
// BEFORE the handler runs.
// ---------------------------------------------------------------------------
vi.mock('../../src/lib/prisma.js', () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
        passwordHash: '$2b$12$hash',
        createdAt: new Date(),
      }),
    },
    session: {
      create: vi.fn().mockResolvedValue({ id: 'sess-1' }),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRouter);
  return app;
}

const VALID_REGISTER = { name: 'Test User', email: 'test@example.com', password: 'password123' };

describe('POST /auth/register — R2-REG-002 Zod validation', () => {
  const app = makeApp();

  it('name 200 chars → 400 VALIDATION_FAILED (prevents Prisma VARCHAR overflow)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID_REGISTER, name: 'a'.repeat(200) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('password 200 chars → 400 VALIDATION_FAILED (prevents bcrypt DoS)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID_REGISTER, password: 'a'.repeat(200) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('email 300 chars → 400 VALIDATION_FAILED', async () => {
    const longEmail = `${'a'.repeat(290)}@example.com`;
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID_REGISTER, email: longEmail });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('invalid email format → 400 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID_REGISTER, email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('password too short (< 8 chars) → 400 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID_REGISTER, password: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('missing name → 400 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('valid input → validation passes (201 or 409, NOT 400)', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send(VALID_REGISTER);

    // Either 201 (created) or 409 (email exists in mock) — NOT 400 (validation failed)
    expect(res.status).not.toBe(400);
  });
});

describe('POST /auth/login — R2-REG-002 Zod validation', () => {
  const app = makeApp();

  it('password 200 chars → 400 VALIDATION_FAILED (prevents bcrypt DoS)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'a'.repeat(200) });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('invalid email format → 400 VALIDATION_FAILED', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('email 300 chars → 400 VALIDATION_FAILED', async () => {
    const longEmail = `${'a'.repeat(290)}@example.com`;
    const res = await request(app)
      .post('/auth/login')
      .send({ email: longEmail, password: 'password123' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
  });

  it('valid input → validation passes (401 invalid creds from mock, NOT 400)', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).not.toBe(400);
  });
});
