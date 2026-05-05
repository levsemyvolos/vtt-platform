import { randomUUID } from 'crypto';
import type {
  CharacterSheetDTO,
  CharacterCreateRequest,
  CharacterUpdateRequest,
  Role,
} from '@vtt/shared';
import type {
  CharacterRepository,
  CharacterWithPdf,
} from '../repositories/CharacterRepository.js';
import type { FileStorageAdapter } from '../infrastructure/storage/FileStorageAdapter.js';
import { AssetService } from './AssetService.js';
import { HttpError } from '../lib/errors.js';

/**
 * Character sheet service (Ф9.1 — Ф9.3).
 *
 * RBAC (table 2.19):
 *   - **Read**: GM sees full data for every character; the owning Player
 *     sees their own full sheet; everyone else gets a `short` projection
 *     (`kind === 'short'`) that omits `sheetData` and `pdfUrl`.
 *   - **Update**: only the owner. The GM does NOT modify a Player's sheet
 *     without consent (Ф9.2 / RBAC matrix invariant
 *     "Ведучий не модифікує аркуші гравців без згоди").
 *   - **Delete**: owner or GM (clean-up after a Player leaves).
 *   - **PDF upload**: owner or GM (GM-driven import shortcut).
 */
export class CharacterService {
  constructor(
    private readonly characterRepo: CharacterRepository,
    private readonly fileStorage: FileStorageAdapter | null,
    private readonly assetService: AssetService | null,
  ) {}

  async create(
    roomId: string,
    ownerId: string,
    dto: CharacterCreateRequest,
  ): Promise<CharacterSheetDTO> {
    const created = await this.characterRepo.create({
      id: randomUUID(),
      ownerId,
      roomId,
      name: dto.name,
      sheetData: (dto.sheetData ?? {}) as object,
    });
    // Owner is the creator → always full DTO on create.
    return this.projectForViewer(created, 'Player', ownerId);
  }

  async update(
    characterId: string,
    viewerId: string,
    _viewerRole: Role,
    dto: CharacterUpdateRequest,
  ): Promise<CharacterSheetDTO> {
    const existing = await this.requireExisting(characterId);
    if (existing.ownerId !== viewerId) {
      throw new HttpError(
        403,
        'Only the character owner may modify the sheet (RBAC matrix Ф9.2)',
      );
    }
    const data: { name?: string; sheetData?: object } = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.sheetData !== undefined) data.sheetData = dto.sheetData as object;
    const updated = await this.characterRepo.update(characterId, data);
    return this.projectForViewer(updated, 'Player', viewerId);
  }

  async delete(
    characterId: string,
    viewerId: string,
    viewerRole: Role,
  ): Promise<void> {
    const existing = await this.requireExisting(characterId);
    if (existing.ownerId !== viewerId && viewerRole !== 'GM') {
      throw new HttpError(403, 'Only the owner or GM may delete a character');
    }
    await this.characterRepo.delete(characterId);
  }

  async listForViewer(
    roomId: string,
    viewerRole: Role,
    viewerId: string,
  ): Promise<CharacterSheetDTO[]> {
    const rows = await this.characterRepo.listByRoom(roomId);
    return Promise.all(rows.map((c) => this.projectForViewer(c, viewerRole, viewerId)));
  }

  async getForViewer(
    characterId: string,
    viewerRole: Role,
    viewerId: string,
  ): Promise<CharacterSheetDTO> {
    const existing = await this.requireExisting(characterId);
    return this.projectForViewer(existing, viewerRole, viewerId);
  }

  /**
   * Algorithm A6 (RBAC-projection, §2.17.6) for a character sheet.
   *
   * Returns the discriminated DTO:
   *   - GM viewer OR owner viewer → `kind: 'full'` with sheetData + pdfUrl.
   *   - everyone else             → `kind: 'short'` (no sheetData / pdfUrl).
   *
   * `pdfUrl` is materialised through `fileStorage.getPresignedUrl` and is
   * only included in the `full` branch. The `short` branch never carries
   * `sheetData` as a key (verified by tests via Object.keys check).
   */
  async projectForViewer(
    character: CharacterWithPdf,
    viewerRole: Role,
    viewerId: string,
  ): Promise<CharacterSheetDTO> {
    const isOwner = character.ownerId === viewerId;
    const seesFull = viewerRole === 'GM' || isOwner;

    if (seesFull) {
      const full: CharacterSheetDTO = {
        kind: 'full',
        id: character.id,
        ownerId: character.ownerId,
        roomId: character.roomId,
        name: character.name,
        sheetData: character.sheetData,
        updatedAt: character.updatedAt.toISOString(),
      };
      if (character.pdfAsset) {
        full.pdfUrl = AssetService.getProxyUrl(character.pdfAsset.id);
      }
      return full;
    }

    // Short projection — keep the surface intentionally minimal.
    const short: CharacterSheetDTO = {
      kind: 'short',
      id: character.id,
      ownerId: character.ownerId,
      name: character.name,
    };
    return short;
  }

  /**
   * Uploads a PDF aligned with a character (Ф9.3 — імпорт PDF аркуша).
   * `mimeType` must be `application/pdf`; everything else is rejected.
   *
   * @throws HttpError 400 when mimeType is wrong
   * @throws HttpError 403 when viewer is neither owner nor GM
   * @throws HttpError 503 when file storage / asset service is not wired
   */
  async uploadPdf(
    characterId: string,
    viewerId: string,
    viewerRole: Role,
    fileBuffer: Buffer,
    mimeType: string,
  ): Promise<CharacterSheetDTO> {
    if (mimeType !== 'application/pdf') {
      throw new HttpError(400, 'Only application/pdf is accepted for character PDFs');
    }
    if (!this.assetService) {
      throw new HttpError(503, 'File storage not configured on this server');
    }

    const existing = await this.requireExisting(characterId);
    if (existing.ownerId !== viewerId && viewerRole !== 'GM') {
      throw new HttpError(403, 'Only the owner or GM may upload a character PDF');
    }

    const asset = await this.assetService.uploadUserFile(
      fileBuffer,
      mimeType,
      viewerId,
      existing.roomId,
      `character-${characterId.slice(0, 8)}.pdf`,
    );
    const updated = await this.characterRepo.setPdfAssetId(characterId, asset.id);
    return this.projectForViewer(updated, viewerRole, viewerId);
  }

  private async requireExisting(characterId: string): Promise<CharacterWithPdf> {
    const c = await this.characterRepo.findById(characterId);
    if (!c) throw new HttpError(404, 'Character not found');
    return c;
  }
}
