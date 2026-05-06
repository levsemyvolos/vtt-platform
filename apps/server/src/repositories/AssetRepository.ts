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
   * Returns assets for a room, optionally filtered by MIME type prefix.
   * @param roomId Room UUID
   * @param mimePrefix e.g. 'image/' or 'audio/' — pass empty string for all
   */
  findByRoomAndType(roomId: string, mimePrefix: string): Promise<import('@prisma/client').Asset[]> {
    return this.db.asset.findMany({
      where: mimePrefix
        ? { roomId, mimeType: { startsWith: mimePrefix } }
        : { roomId },
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
}
