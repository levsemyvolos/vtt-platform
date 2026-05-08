import type { JournalEntryDTO, JournalCreateRequest, JournalUpdateRequest, Role } from '@vtt/shared';
import type { JournalEntryWithRelations } from '../repositories/JournalRepository.js';
import type { JournalRepository } from '../repositories/JournalRepository.js';
import { AssetService } from './AssetService.js';
import { HttpError } from '../lib/errors.js';
import { randomUUID } from 'crypto';

export class JournalService {
  constructor(private readonly journals: JournalRepository) {}

  /** Default: visibility=private (notes-style). Recipients via separate grant call. */
  async create(
    roomId: string,
    authorId: string,
    dto: JournalCreateRequest,
  ): Promise<JournalEntryWithRelations> {
    return this.journals.create({
      id: randomUUID(),
      roomId,
      authorId,
      title: dto.title,
      body: dto.body,
      visibility: 'private',
      assetId: dto.assetId ?? null,
    });
  }

  async update(
    entryId: string,
    viewerId: string,
    viewerRole: Role,
    dto: JournalUpdateRequest,
  ): Promise<JournalEntryWithRelations> {
    const existing = await this.requireExisting(entryId);
    this.assertCanWrite(existing, viewerId, viewerRole);
    const data: {
      title?: string;
      body?: string;
      assetId?: string | null;
    } = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.body !== undefined) data.body = dto.body;
    if (dto.assetId !== undefined) data.assetId = dto.assetId; // null = clear
    return this.journals.update(entryId, data);
  }

  async delete(
    entryId: string,
    viewerId: string,
    viewerRole: Role,
  ): Promise<JournalEntryWithRelations> {
    const existing = await this.requireExisting(entryId);
    this.assertCanWrite(existing, viewerId, viewerRole);
    await this.journals.deleteById(entryId);
    return existing; // return so caller can emit deleted event with roomId
  }

  /**
   * Replaces recipient list. Empty array → visibility=private (revoke).
   * Non-empty → visibility=shared.
   * GM-only operation.
   */
  async grant(
    entryId: string,
    userIds: string[],
    viewerRole: Role,
  ): Promise<JournalEntryWithRelations> {
    if (viewerRole !== 'GM') {
      throw new HttpError(403, 'Only GM can grant or revoke journal entries');
    }
    await this.requireExisting(entryId);
    await this.journals.setRecipients(entryId, userIds);
    return this.journals.update(entryId, {
      visibility: userIds.length > 0 ? 'shared' : 'private',
    });
  }

  async listForViewer(
    roomId: string,
    viewerId: string,
    viewerRole: Role,
  ): Promise<JournalEntryDTO[]> {
    const all = await this.journals.listByRoom(roomId);
    const visible = all.filter((e) => this.canView(e, viewerId, viewerRole));
    return visible.map((e) => this.projectForViewer(e));
  }

  async getForViewer(
    entryId: string,
    viewerId: string,
    viewerRole: Role,
  ): Promise<JournalEntryDTO> {
    const existing = await this.requireExisting(entryId);
    if (!this.canView(existing, viewerId, viewerRole)) {
      throw new HttpError(404, 'Journal entry not found');
    }
    return this.projectForViewer(existing);
  }

  /** Project DB row → DTO. Includes asset URL/MIME if attached. */
  projectForViewer(entry: JournalEntryWithRelations): JournalEntryDTO {
    const dto: JournalEntryDTO = {
      id: entry.id,
      roomId: entry.roomId,
      authorId: entry.authorId,
      title: entry.title,
      body: entry.body,
      visibility: entry.visibility as 'private' | 'shared',
      recipientIds: entry.recipients.map((r) => r.userId),
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
    if (entry.asset) {
      dto.assetUrl = AssetService.getProxyUrl(entry.asset.id);
      dto.assetMime = entry.asset.mimeType;
    }
    return dto;
  }

  /** Public visibility predicate — used by route broadcast helper. */
  canView(entry: JournalEntryWithRelations, viewerId: string, viewerRole: Role): boolean {
    if (viewerRole === 'GM') return true;
    if (entry.authorId === viewerId) return true;
    if (
      entry.visibility === 'shared' &&
      entry.recipients.some((r) => r.userId === viewerId)
    ) {
      return true;
    }
    return false;
  }

  private assertCanWrite(
    entry: JournalEntryWithRelations,
    viewerId: string,
    viewerRole: Role,
  ): void {
    if (viewerRole === 'GM') return;
    if (entry.authorId === viewerId) return;
    throw new HttpError(403, 'Only the author or GM can modify the journal entry');
  }

  private async requireExisting(entryId: string): Promise<JournalEntryWithRelations> {
    const e = await this.journals.findById(entryId);
    if (!e) throw new HttpError(404, 'Journal entry not found');
    return e;
  }
}
