import type { PrismaClient, Prisma, Token } from '@prisma/client';

export class TokenRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<Token | null> {
    return this.db.token.findUnique({ where: { id } });
  }

  listBySceneId(sceneId: string): Promise<Token[]> {
    return this.db.token.findMany({ where: { sceneId } });
  }

  create(data: Prisma.TokenCreateInput): Promise<Token> {
    return this.db.token.create({ data });
  }

  /**
   * OCC-guarded update (algorithm A2, §2.17.3).
   * Updates row only when the persisted version matches `expectedVersion`,
   * incrementing version atomically. Returns null when no row matched
   * (i.e. concurrent write happened — caller must rollback).
   *
   * Implementation note: Prisma's updateMany returns a count, so we use it
   * to obtain the optimistic lock. A successful update is followed by a
   * findUnique to return the new state.
   */
  async updatePositionWithVersion(
    id: string,
    expectedVersion: number,
    x: number,
    y: number,
  ): Promise<Token | null> {
    const result = await this.db.token.updateMany({
      where: { id, version: expectedVersion },
      data: { x, y, version: expectedVersion + 1 },
    });
    if (result.count === 0) return null;
    return this.db.token.findUnique({ where: { id } });
  }

  /**
   * Bulk-applies token positions from an Edit Scene flush (Sess 5.5 Mini-C).
   * Updates x/y for each token in the list, scoped to sceneId to prevent
   * cross-scene token id collisions. Does NOT bump version — OCC version bumps
   * only happen on real-time `token:move` events. Atomic via Prisma transaction.
   */
  async bulkUpdatePositions(
    sceneId: string,
    tokens: ReadonlyArray<{ id: string; x: number; y: number }>,
  ): Promise<void> {
    if (tokens.length === 0) return;
    await this.db.$transaction(
      tokens.map((t) =>
        this.db.token.update({
          where: { id: t.id, sceneId },
          data: { x: t.x, y: t.y },
        }),
      ),
    );
  }

  update(id: string, data: Prisma.TokenUpdateInput): Promise<Token> {
    return this.db.token.update({ where: { id }, data });
  }

  delete(id: string): Promise<Token> {
    return this.db.token.delete({ where: { id } });
  }
}
