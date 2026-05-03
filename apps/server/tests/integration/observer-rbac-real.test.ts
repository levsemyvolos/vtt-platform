/**
 * Observer RBAC — real end-to-end integration test (Wave 6.1).
 *
 * Purpose: Verify that AuthService.issueObserverTokens() produces a JWT with
 * role='Observer' and boundRoomId, and that rotateRefresh() preserves those
 * fields. Uses real AuthService with stub repos — NO synthetic JWT fabrication.
 *
 * This test was created to catch the regression where unit tests passed
 * (using synthetic tokens) while the real service still issued role:'Player'
 * tokens without boundRoomId (B7-BUG-002, BUG-003).
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import jwt from 'jsonwebtoken';
import { AuthService } from '../../src/services/AuthService.js';
import type { UserRepository } from '../../src/repositories/UserRepository.js';
import type { SessionRepository } from '../../src/repositories/SessionRepository.js';
import type { UserPublic } from '@vtt/shared';

// JWT_SECRET is set in tests/setup.ts
const SECRET = process.env['JWT_SECRET'] as string;

// ---------------------------------------------------------------------------
// Stub repos — minimal implementation for AuthService integration
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'observer-user-uuid-001';
const TEST_ROOM_ID = 'room-bound-uuid-abc';

function makeUserRepo(): UserRepository {
  return {
    findById: vi.fn().mockResolvedValue({
      id: TEST_USER_ID,
      email: 'observer@anon.local',
      displayName: 'QA Observer',
      passwordHash: '',
      createdAt: new Date(),
    }),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
  } as unknown as UserRepository;
}

let capturedSessionData: Record<string, unknown> = {};

function makeSessionRepo(): SessionRepository {
  return {
    findById: vi.fn().mockImplementation((id: string) => {
      return Promise.resolve({
        id,
        userId: TEST_USER_ID,
        refreshTokenHash: capturedSessionData['refreshTokenHash'] as string,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: 'test-agent',
      });
    }),
    create: vi.fn().mockImplementation((data: { refreshTokenHash?: string }) => {
      capturedSessionData = { refreshTokenHash: data.refreshTokenHash };
      return Promise.resolve({});
    }),
    deleteById: vi.fn().mockResolvedValue(undefined),
    deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    findActiveByUserId: vi.fn().mockResolvedValue([]),
  } as unknown as SessionRepository;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Observer RBAC — real end-to-end (no synthetic JWT)', () => {
  let authService: AuthService;
  let observerAccessToken: string;
  let observerRefreshToken: string;

  beforeAll(async () => {
    authService = new AuthService(makeUserRepo(), makeSessionRepo());

    // Real flow: issueObserverTokens (mimics POST /rooms/join-invite)
    const userPublic: UserPublic = {
      id: TEST_USER_ID,
      email: 'observer@anon.local',
      name: 'QA Observer',
      boundRoomId: TEST_ROOM_ID,
    };
    const tokens = await authService.issueObserverTokens(userPublic, TEST_ROOM_ID, 'test-ua');
    observerAccessToken = tokens.accessToken;
    observerRefreshToken = tokens.refreshToken;
  });

  it('observer access JWT has role="Observer"', () => {
    const decoded = jwt.decode(observerAccessToken) as Record<string, unknown>;
    expect(decoded['role']).toBe('Observer');
  });

  it('observer access JWT has boundRoomId matching the room', () => {
    const decoded = jwt.decode(observerAccessToken) as Record<string, unknown>;
    expect(decoded['boundRoomId']).toBe(TEST_ROOM_ID);
  });

  it('observer refresh JWT has role="Observer" (preserved for rotation)', () => {
    const decoded = jwt.decode(observerRefreshToken) as Record<string, unknown>;
    expect(decoded['role']).toBe('Observer');
  });

  it('observer refresh JWT has boundRoomId (preserved for rotation)', () => {
    const decoded = jwt.decode(observerRefreshToken) as Record<string, unknown>;
    expect(decoded['boundRoomId']).toBe(TEST_ROOM_ID);
  });

  it('rotateRefresh produces new access token with role="Observer"', async () => {
    // bcrypt.compare is mocked at module level in unit tests setup, but here we
    // need a real bcrypt compare to succeed. We mock bcryptjs for this test file.
    const bcryptMod = await import('bcryptjs');
    vi.spyOn(bcryptMod.default, 'compare').mockResolvedValue(true as never);
    vi.spyOn(bcryptMod.default, 'hash').mockResolvedValue('hashed' as never);

    const rotated = await authService.rotateRefresh(observerRefreshToken);
    const decoded = jwt.decode(rotated.accessToken) as Record<string, unknown>;

    expect(decoded['role']).toBe('Observer');
    expect(decoded['boundRoomId']).toBe(TEST_ROOM_ID);
  });

  it('rotateRefresh produces new refresh token with role="Observer"', async () => {
    // Re-use the previous spy results — bcryptjs is already mocked above
    const rotated = await authService.rotateRefresh(observerRefreshToken);
    const decoded = jwt.decode(rotated.refreshToken) as Record<string, unknown>;

    expect(decoded['role']).toBe('Observer');
    expect(decoded['boundRoomId']).toBe(TEST_ROOM_ID);
  });

  it('rotated response user has boundRoomId (Observer client identity preserved)', async () => {
    const rotated = await authService.rotateRefresh(observerRefreshToken);
    expect(rotated.user.boundRoomId).toBe(TEST_ROOM_ID);
  });

  it('regular user issueTokenPair does NOT bake boundRoomId into JWT', async () => {
    const regularService = new AuthService(
      {
        findById: vi.fn().mockResolvedValue({ id: 'gm-id', email: 'gm@test.com', displayName: 'GM', passwordHash: 'h' }),
        findByEmail: vi.fn().mockResolvedValue({ id: 'gm-id', email: 'gm@test.com', displayName: 'GM', passwordHash: 'hashed' }),
        create: vi.fn(),
      } as unknown as UserRepository,
      {
        ...makeSessionRepo(),
        create: vi.fn().mockResolvedValue({}),
      } as unknown as SessionRepository,
    );

    const bcryptMod = await import('bcryptjs');
    vi.spyOn(bcryptMod.default, 'compare').mockResolvedValue(true as never);
    vi.spyOn(bcryptMod.default, 'hash').mockResolvedValue('hashed' as never);

    const tokens = await regularService.login('gm@test.com', 'password', 'ua');
    const decoded = jwt.decode(tokens.accessToken) as Record<string, unknown>;

    expect(decoded['role']).toBe('Player');
    expect(decoded['boundRoomId']).toBeUndefined();
  });
});
