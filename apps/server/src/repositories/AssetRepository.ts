import { PrismaClient, type Asset, type Prisma } from '@prisma/client';

export class AssetRepository {
  constructor(private readonly db: PrismaClient) {}

  /**
   * @param id Asset UUID
   * @returns Asset or null
   */
  findById(id: string): Promise<Asset | null> {
    return this.db.asset.findUnique({ where: { id } });
  }

  /**
   * @param data Prisma.AssetCreateInput
   * @returns created Asset
   */
  create(data: Prisma.AssetUncheckedCreateInput): Promise<Asset> {
    return this.db.asset.create({ data });
  }

  /**
   * @param id Asset UUID
   */
  async deleteById(id: string): Promise<void> {
    await this.db.asset.delete({ where: { id } });
  }

  /**
   * Returns assets for a room, optionally filtered by MIME type prefix and/or source.
   * @param roomId Room UUID
   * @param mimePrefix e.g. 'image/' or 'audio/' — pass empty string for all
   * @param source optional filter: 'ai' (AI_IMAGE | AI_AUDIO) or 'upload' (UPLOAD)
   */
  findByRoomAndType(
    roomId: string,
    mimePrefix: string,
    source?: 'ai' | 'upload',
  ): Promise<import('@prisma/client').Asset[]> {
    const where: import('@prisma/client').Prisma.AssetWhereInput = { roomId };
    if (mimePrefix) where.mimeType = { startsWith: mimePrefix };
    if (source === 'ai') where.source = { in: ['AI_IMAGE', 'AI_AUDIO'] };
    if (source === 'upload') where.source = 'UPLOAD';
    return this.db.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Updates the display name of an asset. storageKey is intentionally NOT
   * touched — UUID-based storage paths must stay stable for GCS object identity.
   */
  rename(id: string, originalName: string): Promise<Asset> {
    return this.db.asset.update({
      where: { id },
      data: { originalName },
    });
  }

  /**
   * Counts assets in a room with a specific source, optionally since a cutoff time.
   * Used by AI quota endpoint.
   */
  countByRoomAndSource(
    roomId: string,
    source: 'AI_IMAGE' | 'AI_AUDIO',
  ): Promise<number> {
    return this.db.asset.count({ where: { roomId, source } });
  }

  countByRoomAndSourceSince(
    roomId: string,
    source: 'AI_IMAGE' | 'AI_AUDIO',
    since: Date,
  ): Promise<number> {
    return this.db.asset.count({
      where: { roomId, source, createdAt: { gt: since } },
    });
  }
}
