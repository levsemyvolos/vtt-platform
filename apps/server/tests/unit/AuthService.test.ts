import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { AuthService } from '../../src/services/AuthService.js';
import type { UserRepository } from '../../src/repositories/UserRepository.js';
import type { SessionRepository } from '../../src/repositories/SessionRepository.js';

// QW-7: refresh tokens are now SHA-256 hashed (was bcryptjs). Sessions must
// store the matching sha256 digest for `verifyRefresh` to accept the token.
const MOCK_REFRESH = 'signed.jwt.token';
const VALID_REFRESH_HASH = createHash('sha256').update(MOCK_REFRESH).digest('hex');

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn().mockReturnValue('signed.jwt.token'),
    verify: vi.fn().mockReturnValue({ sub: 'user-123', sid: 'session-old', role: 'Player' }),
  },
}));

// Minimal stub factories — only the methods AuthService actually calls
function makeUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findById: vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hashed',
      createdAt: new Date(),
    }),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      passwordHash: 'hashed',
      createdAt: new Date(),
    }),
    ...overrides,
  } as unknown as UserRepository;
}

function makeSessionRepo(overrides: Partial<SessionRepository> = {}): SessionRepository {
  const callOrder: string[] = [];
  return {
    findById: vi.fn().mockResolvedValue({
      id: 'session-old',
      userId: 'user-123',
      refreshTokenHash: VALID_REFRESH_HASH,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000),
      userAgent: 'test-agent',
    }),
    findActiveByUserId: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(() => {
      callOrder.push('create');
      return Promise.resolve({});
    }),
    deleteById: vi.fn().mockImplementation(() => {
      callOrder.push('deleteById');
      return Promise.resolve();
    }),
    deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
    _callOrder: callOrder,
    ...overrides,
  } as unknown as SessionRepository & { _callOrder: string[] };
}

describe('AuthService.rotateRefresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('happy path: deleteById is called before create (session swap order invariant)', async () => {
    const callOrder: string[] = [];

    const sessionRepo = {
      findById: vi.fn().mockResolvedValue({
        id: 'session-old',
        userId: 'user-123',
        refreshTokenHash: VALID_REFRESH_HASH,
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: 'ua',
      }),
      deleteById: vi.fn().mockImplementation(() => {
        callOrder.push('deleteById');
        return Promise.resolve();
      }),
      create: vi.fn().mockImplementation(() => {
        callOrder.push('create');
        return Promise.resolve({});
      }),
      deleteAllByUserId: vi.fn().mockResolvedValue(undefined),
      findActiveByUserId: vi.fn().mockResolvedValue([]),
    } as unknown as SessionRepository;

    const userRepo = makeUserRepo();
    const service = new AuthService(userRepo, sessionRepo);

    await service.rotateRefresh('signed.jwt.token');

    expect(callOrder).toEqual(['deleteById', 'create']);
  });

  it('returns 401 and calls deleteAllByUserId when session not found in DB', async () => {
    const sessionRepo = makeSessionRepo({
      findById: vi.fn().mockResolvedValue(null),
    });
    const userRepo = makeUserRepo();
    const service = new AuthService(userRepo, sessionRepo);

    await expect(service.rotateRefresh('signed.jwt.token')).rejects.toMatchObject({
      status: 401,
      message: 'Refresh token reuse detected',
    });

    expect(sessionRepo.deleteAllByUserId).toHaveBeenCalledWith('user-123');
  });

  it('result (AuthTokenPair) never contains refreshTokenHash field', async () => {
    const sessionRepo = makeSessionRepo();
    const userRepo = makeUserRepo();
    const service = new AuthService(userRepo, sessionRepo);

    const result = await service.rotateRefresh('signed.jwt.token');

    expect(result).not.toHaveProperty('refreshTokenHash');
    // Only the expected AuthTokenPair fields are present
    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result).toHaveProperty('expiresIn');
    expect(result).toHaveProperty('user');
  });

  it('returns 401 and calls deleteAllByUserId when stored hash does not match (QW-7: sha256 mismatch)', async () => {
    // Store a hash that will never match sha256(MOCK_REFRESH) — verifyRefresh
    // must reject and trigger the reuse-attack remediation path.
    const sessionRepo = makeSessionRepo({
      findById: vi.fn().mockResolvedValue({
        id: 'session-old',
        userId: 'user-123',
        refreshTokenHash: createHash('sha256').update('different-token').digest('hex'),
        issuedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        userAgent: 'ua',
      }),
    });
    const userRepo = makeUserRepo();
    const service = new AuthService(userRepo, sessionRepo);

    await expect(service.rotateRefresh('signed.jwt.token')).rejects.toMatchObject({
      status: 401,
      message: 'Refresh token compromised',
    });

    expect(sessionRepo.deleteAllByUserId).toHaveBeenCalledWith('user-123');
  });
});
