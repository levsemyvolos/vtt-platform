import type { PrismaClient, Prisma, Character } from '@prisma/client';

export type CharacterWithPdf = Prisma.CharacterGetPayload<{
  include: { pdfAsset: true };
}>;

/**
 * Persistence for Ф9 — character sheets.
 * RBAC is performed in CharacterService.projectForViewer (algorithm A6).
 */
export class CharacterRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<CharacterWithPdf | null> {
    return this.db.character.findUnique({
      where: { id },
      include: { pdfAsset: true },
    });
  }

  listByRoom(roomId: string): Promise<CharacterWithPdf[]> {
    return this.db.character.findMany({
      where: { roomId },
      include: { pdfAsset: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(data: Prisma.CharacterUncheckedCreateInput): Promise<CharacterWithPdf> {
    return this.db.character.create({
      data,
      include: { pdfAsset: true },
    });
  }

  update(id: string, data: Prisma.CharacterUpdateInput): Promise<CharacterWithPdf> {
    return this.db.character.update({
      where: { id },
      data,
      include: { pdfAsset: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.character.delete({ where: { id } });
  }

  setPdfAssetId(id: string, assetId: string): Promise<CharacterWithPdf> {
    return this.db.character.update({
      where: { id },
      data: { pdfAsset: { connect: { id: assetId } } },
      include: { pdfAsset: true },
    });
  }
}
