/**
 * Unit tests for validate() middleware — closes BUG-004.
 *
 * Verifies that:
 * 1. Oversized room names return 400 VALIDATION_FAILED (not 500).
 * 2. Valid payloads pass through with trimmed data.
 * 3. Missing required fields return 400.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { validate } from '../../src/middleware/validate.js';
import { roomCreateSchema } from '../../src/schemas/room.schema.js';

function mockReqRes(body: unknown): {
  req: Partial<Request>;
  res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> };
  next: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const req = { body } as Partial<Request>;
  const res = { status, json } as unknown as Response;
  const next = vi.fn();
  return { req, res: { status, json }, next };
}

describe('validate() middleware', () => {
  const handler = validate(roomCreateSchema);

  it('passes valid payload through and calls next()', () => {
    const { req, next } = mockReqRes({ name: 'My Room', gameSystem: 'D&D 5e' });
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
    handler(req as Request, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect((req as Request).body).toMatchObject({ name: 'My Room', gameSystem: 'D&D 5e' });
  });

  it('trims whitespace from name', () => {
    const { req, next } = mockReqRes({ name: '  My Room  ', gameSystem: 'Homebrew' });
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
    handler(req as Request, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect((req as Request).body.name).toBe('My Room');
  });

  it('returns 400 VALIDATION_FAILED when name exceeds 100 chars (BUG-004)', () => {
    const longName = 'A'.repeat(101);
    const { req, next } = mockReqRes({ name: longName, gameSystem: 'D&D 5e' });
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn, json: jsonFn } as unknown as Response;
    handler(req as Request, res, next as unknown as NextFunction);
    expect(statusFn).toHaveBeenCalledWith(400);
    const responseBody = jsonFn.mock.calls[0]?.[0] as { code: string };
    expect(responseBody.code).toBe('VALIDATION_FAILED');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_FAILED when gameSystem exceeds 50 chars (MIN-008)', () => {
    const longSystem = 'B'.repeat(51);
    const { req } = mockReqRes({ name: 'Room', gameSystem: longSystem });
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn, json: jsonFn } as unknown as Response;
    const next = vi.fn();
    validate(roomCreateSchema)(req as Request, res, next as unknown as NextFunction);
    expect(statusFn).toHaveBeenCalledWith(400);
    const responseBody = jsonFn.mock.calls[0]?.[0] as { code: string };
    expect(responseBody.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 when name is missing', () => {
    const { req } = mockReqRes({ gameSystem: 'D&D 5e' });
    const jsonFn = vi.fn();
    const statusFn = vi.fn().mockReturnValue({ json: jsonFn });
    const res = { status: statusFn, json: jsonFn } as unknown as Response;
    const next = vi.fn();
    validate(roomCreateSchema)(req as Request, res, next as unknown as NextFunction);
    expect(statusFn).toHaveBeenCalledWith(400);
  });

  it('applies default gameSystem when omitted', () => {
    const { req, next } = mockReqRes({ name: 'Solo Room' });
    const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
    handler(req as Request, res, next as unknown as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect((req as Request).body.gameSystem).toBe('D&D 5e');
  });
});
