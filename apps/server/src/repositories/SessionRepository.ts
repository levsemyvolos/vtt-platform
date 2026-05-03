import { PrismaClient, Prisma, Session } from '@prisma/client';

export class SessionRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * @param id Session UUID
   * @returns Session or null
   */
  findById(id: string): Promise<Session | null> {
    return this.db.session.findUnique({ where: { id } });
  }

  /**
   * @param userId User UUID
   * @param now current timestamp for expiry comparison
   * @returns active (non-expired) sessions for the user
   */
  findActiveByUserId(userId: string, now: Date): Promise<Session[]> {
    return this.db.session.findMany({
      where: { userId, expiresAt: { gt: now } },
    });
  }

  /**
   * @param data Prisma.SessionCreateInput
   * @returns created Session
   */
  create(data: Prisma.SessionCreateInput): Promise<Session> {
    return this.db.session.create({ data });
  }

  /**
   * @param id Session UUID to delete
   */
  async deleteById(id: string): Promise<void> {
    // deleteMany is idempotent — no P2025 if session already deleted (stale cookie scenario).
    await this.db.session.deleteMany({ where: { id } });
  }

  /**
   * Deletes all sessions for a user — called on reuse-attack detection.
   * @param userId User UUID
   */
  async deleteAllByUserId(userId: string): Promise<void> {
    await this.db.session.deleteMany({ where: { userId } });
  }
}
