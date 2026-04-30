import type { PrismaClient, Prisma, Scene } from '@prisma/client';

export type SceneWithTokens = Prisma.SceneGetPayload<{ include: { tokens: true } }>;

export class SceneRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<Scene | null> {
    return this.db.scene.findUnique({ where: { id } });
  }

  findByIdWithTokens(id: string): Promise<SceneWithTokens | null> {
    return this.db.scene.findUnique({ where: { id }, include: { tokens: true } });
  }

  findActiveByRoomId(roomId: string): Promise<SceneWithTokens | null> {
    return this.db.scene.findFirst({
      where: { roomId, isActive: true },
      include: { tokens: true },
    });
  }

  listByRoomId(roomId: string): Promise<Scene[]> {
    return this.db.scene.findMany({ where: { roomId } });
  }

  create(data: Prisma.SceneCreateInput): Promise<Scene> {
    return this.db.scene.create({ data });
  }

  update(id: string, data: Prisma.SceneUpdateInput): Promise<Scene> {
    return this.db.scene.update({ where: { id }, data });
  }

  async getCurrentRound(sceneId: string): Promise<number> {
    const row = await this.db.scene.findUnique({
      where: { id: sceneId },
      select: { currentRound: true },
    });
    return row?.currentRound ?? 1;
  }

  /** Atomically increments Scene.currentRound and returns the new value. */
  async incrementRound(sceneId: string): Promise<number> {
    const row = await this.db.scene.update({
      where: { id: sceneId },
      data: { currentRound: { increment: 1 } },
      select: { currentRound: true },
    });
    return row.currentRound;
  }

  /**
   * Atomically deactivates all scenes in the room and activates the target one.
   * Used by SceneService.setActive (Ф2.4).
   */
  async setActive(roomId: string, sceneId: string): Promise<void> {
    await this.db.$transaction([
      this.db.scene.updateMany({ where: { roomId }, data: { isActive: false } }),
      this.db.scene.update({ where: { id: sceneId }, data: { isActive: true } }),
    ]);
  }
}
