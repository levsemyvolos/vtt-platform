import { PrismaClient, type AudioTrack, type Prisma } from '@prisma/client';

/**
 * Persistence-only access to the `AudioTrack` table (§2.15.2). All RBAC and
 * cross-aggregate logic lives in `AudioService`.
 */
export class AudioTrackRepository {
  constructor(private readonly db: PrismaClient) {}

  findById(id: string): Promise<AudioTrack | null> {
    return this.db.audioTrack.findUnique({ where: { id } });
  }

  listByRoom(roomId: string): Promise<AudioTrack[]> {
    return this.db.audioTrack.findMany({
      where: { roomId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * @returns the most recently created track currently bound to `sceneId`,
   * or null if none. Drives Ф6.4 autoplay on scene-switch.
   */
  findActiveForScene(sceneId: string): Promise<AudioTrack | null> {
    return this.db.audioTrack.findFirst({
      where: { sceneId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.AudioTrackUncheckedCreateInput): Promise<AudioTrack> {
    return this.db.audioTrack.create({ data });
  }

  update(id: string, data: Prisma.AudioTrackUncheckedUpdateInput): Promise<AudioTrack> {
    return this.db.audioTrack.update({ where: { id }, data });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.audioTrack.delete({ where: { id } });
  }
}
