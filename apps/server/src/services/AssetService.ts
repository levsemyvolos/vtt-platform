import { randomUUID } from 'crypto';
import type { AssetDTO, AssetSourceLabel } from '@vtt/shared';
import type { Asset, PrismaClient } from '@prisma/client';
import type { AIProvider, GeneratedBinary } from '../infrastructure/ai/AIProvider.js';
import type { FileStorageAdapter } from '../infrastructure/storage/FileStorageAdapter.js';
import { AssetRepository } from '../repositories/AssetRepository.js';
import { HttpError } from '../lib/errors.js';
import { signAssetUrl } from '../lib/assetUrlSigner.js';

/**
 * Coordinator over `AIProvider`, `FileStorageAdapter` and `AssetRepository` (§2.13.4).
 *
 * Asset access pattern (§2.16, revised):
 *   Capability-based signed proxy URL. AssetDTO returns
 *   `/api/assets/:id/file?exp&sig` where sig = HMAC-SHA256(HKDF(JWT_SECRET,
 *   "asset-url-v1"), "v1.assetId.exp"), TTL 4h. The bucket is fully private;
 *   `storageKey` never crosses the server boundary. The signed URL must NEVER
 *   be persisted in scene snapshots, WebSocket payloads, or DB rows — assets
 *   are referenced by `id` and the URL is re-materialized client-side via
 *   GET /api/assets/:id whenever a fresh DTO is fetched.
 *
 * This pattern lets <img> and new Image() (which can't send Authorization
 * headers) load asset bytes without exposing presigned GCS URLs to the client.
 */
function extensionFor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return mimeType.slice('image/'.length);
  if (mimeType.startsWith('audio/')) return mimeType.slice('audio/'.length);
  if (mimeType === 'application/pdf') return 'pdf';
  return 'bin';
}

function buildStorageKey(roomId: string, kind: 'image' | 'audio' | 'doc', mimeType: string): string {
  return `rooms/${roomId}/${kind}/${randomUUID()}.${extensionFor(mimeType)}`;
}

function kindForMime(mimeType: string): 'image' | 'audio' | 'doc' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'doc';
}

export class AssetService {
  constructor(
    private readonly ai: AIProvider,
    private readonly storage: FileStorageAdapter,
    private readonly repo: AssetRepository,
    private readonly db?: PrismaClient,
  ) {}

  /**
   * Persists an AI-generated binary: uploads bytes to GCS and records metadata.
   * Per sequence А.7 the upload and the DB insert are performed in parallel
   * (the `par` fragment is executed by `Promise.all`).
   *
   * @param userId owner of the asset
   * @param roomId room scope (cascade-deleted with the room)
   * @param payload bytes + mimeType from AIProvider
   * @param kind 'image' | 'audio'
   * @param prompt full prompt string for provenance tracking
   * @param aiModel model identifier (e.g. 'gemini-2.5-flash-image')
   * @param opts optional overrides; `displayName` replaces the default
   *             `"AI: <prompt>"` originalName (used by music to surface a
   *             readable mood-derived title instead of the full Lyria prompt).
   * @returns the persisted Asset row
   */
  async storeAiAsset(
    userId: string,
    roomId: string,
    payload: GeneratedBinary,
    kind: 'image' | 'audio',
    prompt: string,
    aiModel: string,
    opts?: { displayName?: string },
  ): Promise<Asset> {
    const storageKey = buildStorageKey(roomId, kind, payload.mimeType);
    const truncatedPrompt = prompt.length > 80 ? `${prompt.slice(0, 77)}...` : prompt;
    const originalName = opts?.displayName?.trim()
      ? opts.displayName.trim().slice(0, 128)
      : `AI: ${truncatedPrompt}`;
    const source = kind === 'image' ? 'AI_IMAGE' : 'AI_AUDIO';
    const [, asset] = await Promise.all([
      this.storage.put({
        storageKey,
        bytes: payload.bytes,
        mimeType: payload.mimeType,
      }),
      this.repo.create({
        id: randomUUID(),
        ownerId: userId,
        roomId,
        mimeType: payload.mimeType,
        size: BigInt(payload.bytes.byteLength),
        storageKey,
        originalName,
        source,
        aiPrompt: prompt,
        aiModel,
      }),
    ]);
    return asset;
  }

  /**
   * Returns a capability-based signed proxy URL for an asset ID.
   * Format: `/api/assets/${assetId}/file?exp=...&sig=...`. TTL 4h.
   * Path matches the mount point in apps/server/src/index.ts and vite proxy.
   */
  static getProxyUrl(assetId: string): string {
    return signAssetUrl(assetId).url;
  }

  private toDTO(a: Asset): AssetDTO {
    const sourceMap: Record<string, AssetSourceLabel> = {
      UPLOAD: 'upload',
      AI_IMAGE: 'ai_image',
      AI_AUDIO: 'ai_audio',
    };
    return {
      id: a.id,
      url: AssetService.getProxyUrl(a.id),
      type: a.mimeType,
      name: a.originalName || (a.storageKey.split('/').pop() ?? a.id),
      roomId: a.roomId,
      source: sourceMap[a.source] ?? 'upload',
      aiPrompt: a.aiPrompt,
      aiModel: a.aiModel,
      createdAt: a.createdAt.toISOString(),
    };
  }

  /**
   * Materializes an AssetDTO with a proxy URL.
   * @param assetId Asset UUID
   * @throws HttpError 404 if asset is missing
   */
  async getAssetDTO(assetId: string): Promise<AssetDTO> {
    const asset = await this.repo.findById(assetId);
    if (!asset) throw new HttpError(404, 'Asset not found');
    return this.toDTO(asset);
  }

  /** Pass-through to repo; used by the rename endpoint for ownership check. */
  findById(assetId: string): Promise<Asset | null> {
    return this.repo.findById(assetId);
  }

  /**
   * Updates an asset's display name. Authorization is enforced by the caller.
   * storageKey is intentionally NOT touched.
   */
  async rename(assetId: string, name: string): Promise<Asset> {
    return this.repo.rename(assetId, name);
  }

  /**
   * Retrieves a readable stream for the asset's content.
   * RBAC check is performed by the caller (AssetRouter).
   */
  async getAssetStream(assetId: string): Promise<{
    stream: NodeJS.ReadableStream;
    mimeType: string;
    size: number;
  }> {
    const asset = await this.repo.findById(assetId);
    if (!asset) throw new HttpError(404, 'Asset not found');

    const meta = await this.storage.statObject(asset.storageKey);
    if (!meta) throw new HttpError(404, 'File missing in storage');

    return {
      stream: this.storage.createReadStream(asset.storageKey),
      mimeType: asset.mimeType,
      size: Number(asset.size),
    };
  }

  /**
   * Lists assets for a room, optionally filtered by type category and/or source.
   * @param roomId Room UUID
   * @param type 'image' | 'audio' | 'pdf' | 'all'
   * @param source optional: 'ai' | 'upload' — filter by asset provenance
   * @returns AssetDTO[] with proxy URLs
   */
  async listByRoomAndType(
    roomId: string,
    type: string,
    source?: 'ai' | 'upload',
  ): Promise<AssetDTO[]> {
    const mimePrefix =
      type === 'image' ? 'image/' :
      type === 'audio' ? 'audio/' :
      type === 'pdf'   ? 'application/pdf' : '';
    const assets = await this.repo.findByRoomAndType(roomId, mimePrefix, source);
    return assets.map((a) => this.toDTO(a));
  }

  /**
   * Persists a user-supplied binary (PDF, image, etc.) WITHOUT going through
   * the AI pipeline. Used by character PDF import (Ф9.3) and any future
   * direct-upload flow.
   *
   * Same par-block layout as `storeAiAsset` — upload bytes and insert metadata
   * concurrently — so the contract stays uniform.
   *
   * @param buffer raw bytes from the client
   * @param mimeType MIME of the upload (e.g. application/pdf)
   * @param ownerId UUID of the uploading user
   * @param roomId room scope (cascade-deleted with the room)
   * @returns persisted Asset row
   */
  async uploadUserFile(
    buffer: Buffer,
    mimeType: string,
    ownerId: string,
    roomId: string,
    originalName: string,
  ): Promise<Asset> {
    const storageKey = buildStorageKey(roomId, kindForMime(mimeType), mimeType);
    const [, asset] = await Promise.all([
      this.storage.put({ storageKey, bytes: buffer, mimeType }),
      this.repo.create({
        id: randomUUID(),
        ownerId,
        roomId,
        mimeType,
        size: BigInt(buffer.byteLength),
        storageKey,
        originalName: originalName.slice(0, 128),
        source: 'UPLOAD',
      }),
    ]);
    return asset;
  }
}
