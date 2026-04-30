import { randomUUID } from 'crypto';
import type {
  HandoutDTO,
  HandoutCreateRequest,
  Role,
} from '@vtt/shared';
import type {
  HandoutRepository,
  HandoutWithRecipientsAndAsset,
} from '../repositories/HandoutRepository.js';
import type { FileStorageAdapter } from '../infrastructure/storage/FileStorageAdapter.js';
import { HttpError } from '../lib/errors.js';

/**
 * Handouts service (Ф7.2).
 *
 * Visibility rules (RBAC matrix §2.18):
 *   - GM       — sees all handouts in the room.
 *   - Player   — sees only handouts whose recipients include the viewer.
 *   - Observer — sees nothing (Ф7.2: observers are not part of the
 *     handout-distribution loop).
 *
 * Mutations (create / grant / revoke / delete) are restricted to GM.
 *
 * `fileStorage` is optional: when GCS is not configured at boot, the service
 * still works but `assetUrl` will always be undefined. This keeps Чат 7.1
 * functional in environments without GCS credentials.
 */
export class HandoutService {
  constructor(
    private readonly handoutRepo: HandoutRepository,
    private readonly fileStorage: FileStorageAdapter | null,
  ) {}

  private assertGm(role: Role): void {
    if (role !== 'GM') {
      throw new HttpError(403, 'Only GM can manage handouts');
    }
  }

  async createHandout(
    roomId: string,
    viewerRole: Role,
    dto: HandoutCreateRequest,
  ): Promise<HandoutDTO> {
    this.assertGm(viewerRole);
    const created = await this.handoutRepo.create({
      id: randomUUID(),
      roomId,
      title: dto.title,
      body: dto.body,
      ...(dto.assetId ? { assetId: dto.assetId } : {}),
    });
    return this.projectHandout(created);
  }

  async grantToPlayers(
    handoutId: string,
    viewerRole: Role,
    userIds: string[],
  ): Promise<HandoutDTO> {
    this.assertGm(viewerRole);
    const updated = await this.handoutRepo.grantTo(handoutId, userIds);
    return this.projectHandout(updated);
  }

  async revokeFromPlayer(
    handoutId: string,
    viewerRole: Role,
    userId: string,
  ): Promise<HandoutDTO> {
    this.assertGm(viewerRole);
    const updated = await this.handoutRepo.revokeFrom(handoutId, userId);
    return this.projectHandout(updated);
  }

  async deleteHandout(handoutId: string, viewerRole: Role): Promise<void> {
    this.assertGm(viewerRole);
    const existing = await this.handoutRepo.findById(handoutId);
    if (!existing) throw new HttpError(404, 'Handout not found');
    await this.handoutRepo.delete(handoutId);
  }

  async listForViewer(
    roomId: string,
    viewerRole: Role,
    viewerId: string,
  ): Promise<HandoutDTO[]> {
    if (viewerRole === 'Observer') return [];
    const rows =
      viewerRole === 'GM'
        ? await this.handoutRepo.listByRoom(roomId)
        : await this.handoutRepo.listGrantedToUser(roomId, viewerId);
    return Promise.all(rows.map((r) => this.projectHandout(r)));
  }

  /**
   * Projects entity → DTO. Resolves the asset's presigned URL when
   * `fileStorage` is wired; otherwise leaves `assetUrl` undefined.
   */
  private async projectHandout(
    row: HandoutWithRecipientsAndAsset,
  ): Promise<HandoutDTO> {
    const dto: HandoutDTO = {
      id: row.id,
      roomId: row.roomId,
      title: row.title,
      body: row.body,
      recipientIds: row.recipients.map((r) => r.userId),
      createdAt: row.createdAt.toISOString(),
    };
    if (row.asset && this.fileStorage) {
      dto.assetUrl = await this.fileStorage.getPresignedUrl(row.asset.storageKey);
    }
    return dto;
  }
}
