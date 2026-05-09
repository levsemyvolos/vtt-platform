import { PrismaClient, type AudioTrack, type Prisma, type AudioLayer } from '@prisma/client';

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
   * @deprecated Use `findActiveTracksForScene` for multi-layer support (S9).
   */
  findActiveForScene(sceneId: string): Promise<AudioTrack | null> {
    return this.db.audioTrack.findFirst({
      where: { sceneId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns all tracks currently bound to `sceneId`, one per layer.
   * If multiple tracks share a layer (legacy data), returns the most recently
   * created one for that layer (first in desc-createdAt order wins).
   */
  async findActiveTracksForScene(sceneId: string): Promise<AudioTrack[]> {
    const rows = await this.db.audioTrack.findMany({
      where: { sceneId },
      orderBy: { createdAt: 'desc' },
    });
    // Dedupe by layer (first wins because rows are sorted desc by createdAt)
    const byLayer = new Map<string, AudioTrack>();
    for (const t of rows) {
      if (!byLayer.has(t.layer)) byLayer.set(t.layer, t);
    }
    return [...byLayer.values()];
  }

  create(data: Prisma.AudioTrackUncheckedCreateInput): Promise<AudioTrack> {
    return this.db.audioTrack.create({ data });
  }

  /**
   * S5.5 P5 — idempotency lookup for `createTrackFromAsset`.
   * Returns the most recent track matching the (room, asset, scene, layer)
   * tuple, or null. Used to deduplicate repeated "Save as track" clicks
   * (race / multiple UI surfaces) so the same AI-asset doesn't appear twice
   * in the in-game music sidepanel.
   */
  findByRoomAssetSceneLayer(
    roomId: string,
    assetId: string,
    sceneId: string | null,
    layer: AudioLayer,
  ): Promise<AudioTrack | null> {
    return this.db.audioTrack.findFirst({
      where: { roomId, assetId, sceneId, layer },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(id: string, data: Prisma.AudioTrackUncheckedUpdateInput): Promise<AudioTrack> {
    return this.db.audioTrack.update({ where: { id }, data });
  }

  async deleteById(id: string): Promise<void> {
    await this.db.audioTrack.delete({ where: { id } });
  }
}
