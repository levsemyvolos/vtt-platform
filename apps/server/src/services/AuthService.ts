import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { AuthTokenPair, UserPublic } from '@vtt/shared';
import type { Role } from '@vtt/shared';
import { UserRepository } from '../repositories/UserRepository.js';
import { SessionRepository } from '../repositories/SessionRepository.js';
import { HttpError } from '../lib/errors.js';

const JWT_SECRET = process.env['JWT_SECRET'];
if (!JWT_SECRET) throw new Error('JWT_SECRET env var is required');

const ACCESS_TTL_SEC = 900; // 15 min
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface RefreshPayload {
  sub: string;
  sid: string;
}

function signAccess(userId: string, role: Role, sessionId: string): string {
  return jwt.sign({ sub: userId, role, sid: sessionId }, JWT_SECRET!, {
    expiresIn: ACCESS_TTL_SEC,
  });
}

function signRefresh(userId: string, sessionId: string): string {
  return jwt.sign({ sub: userId, sid: sessionId }, JWT_SECRET!, {
    expiresIn: '30d',
  });
}

function toUserPublic(user: {
  id: string;
  email: string;
  displayName: string;
}): UserPublic {
  return { id: user.id, email: user.email, name: user.displayName };
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
  ) {}

  /**
   * @param email user email (normalized to lowercase)
   * @param password plain-text password
   * @param displayName display name
   * @param userAgent HTTP User-Agent header value (truncated to 256 chars)
   * @returns AuthTokenPair
   * @throws HttpError 409 if email already registered
   */
  async register(
    email: string,
    password: string,
    displayName: string,
    userAgent = '',
  ): Promise<AuthTokenPair> {
    const existing = await this.users.findByEmail(email.toLowerCase());
    if (existing) throw new HttpError(409, 'Email already registered');
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await this.users.create({
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash,
      displayName,
    });
    return this.issueTokenPair(user.id, 'Player', toUserPublic(user), userAgent);
  }

  /**
   * @param email user email
   * @param password plain-text password
   * @param userAgent HTTP User-Agent header value
   * @returns AuthTokenPair
   * @throws HttpError 401 if credentials invalid
   */
  async login(
    email: string,
    password: string,
    userAgent = '',
  ): Promise<AuthTokenPair> {
    const user = await this.users.findByEmail(email.toLowerCase());
    if (!user) throw new HttpError(401, 'Invalid credentials');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new HttpError(401, 'Invalid credentials');
    return this.issueTokenPair(user.id, 'Player', toUserPublic(user), userAgent);
  }

  /**
   * A5: JWT-rotation with reuse-attack detection.
   * Invariant: Session.refreshTokenHash never leaves the DB — only the hashed value is persisted.
   * On reuse: deletes ALL sessions for userId to force re-login.
   * @param rawRefreshToken raw refresh JWT string from client
   * @returns new AuthTokenPair with rotated tokens
   * @throws HttpError 401 if token invalid, expired, or reuse detected
   */
  async rotateRefresh(rawRefreshToken: string): Promise<AuthTokenPair> {
    // 1. Verify JWT signature (fast check before hitting DB)
    let payload: RefreshPayload;
    try {
      payload = jwt.verify(rawRefreshToken, JWT_SECRET!) as RefreshPayload;
    } catch {
      throw new HttpError(401, 'Invalid refresh token');
    }
    const { sub: userId, sid: sessionId } = payload;

    // 2. Find session in DB
    const session = await this.sessions.findById(sessionId);
    if (!session) {
      // Session already rotated or deleted — possible reuse attack
      await this.sessions.deleteAllByUserId(userId);
      throw new HttpError(401, 'Refresh token reuse detected');
    }

    // 3. bcrypt.compare outside transaction to avoid holding a DB connection during slow hash.
    // NOTE: bcrypt truncates input to 72 bytes — only header+partial payload is compared for long JWTs.
    // Acceptable for MVP per A5 algorithm. Production hardening: use opaque random token instead.
    const valid = await bcrypt.compare(rawRefreshToken, session.refreshTokenHash);
    if (!valid) {
      await this.sessions.deleteAllByUserId(userId);
      throw new HttpError(401, 'Refresh token compromised');
    }

    // 4. Fetch user for response DTO
    const user = await this.users.findById(userId);
    if (!user) throw new HttpError(401, 'User not found');

    // 5. Generate new tokens + hash BEFORE modifying DB (so DB stays consistent on hash failure)
    const newSessionId = randomUUID();
    const newAccessToken = signAccess(userId, 'Player', newSessionId);
    const newRefreshToken = signRefresh(userId, newSessionId);
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 12);

    // 6. Atomic session swap: DELETE old, INSERT new
    await this.sessions.deleteById(sessionId);
    await this.sessions.create({
      id: newSessionId,
      user: { connect: { id: userId } },
      refreshTokenHash: newRefreshHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: session.userAgent,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TTL_SEC,
      user: toUserPublic(user),
    };
  }

  /**
   * @param sessionId session to invalidate
   */
  async logout(sessionId: string): Promise<void> {
    await this.sessions.deleteById(sessionId);
  }

  /**
   * Issues an Observer-role JWT pair for an already-created anonymous user.
   * Used by POST /rooms/join-invite where the route handler creates the
   * anonymous User via UserRepository, then delegates token issuance here.
   * @param userPublic public projection of the freshly-created user
   * @param userAgent HTTP User-Agent header value
   * @returns AuthTokenPair with role='Observer' baked into the access JWT
   */
  async issueObserverTokens(userPublic: UserPublic, userAgent = ''): Promise<AuthTokenPair> {
    return this.issueTokenPair(userPublic.id, 'Observer', userPublic, userAgent);
  }

  private async issueTokenPair(
    userId: string,
    role: Role,
    userPublic: UserPublic,
    userAgent: string,
  ): Promise<AuthTokenPair> {
    const sessionId = randomUUID();
    const accessToken = signAccess(userId, role, sessionId);
    const refreshToken = signRefresh(userId, sessionId);
    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
    await this.sessions.create({
      id: sessionId,
      user: { connect: { id: userId } },
      refreshTokenHash,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: userAgent.slice(0, 256),
    });
    return { accessToken, refreshToken, expiresIn: ACCESS_TTL_SEC, user: userPublic };
  }
}
