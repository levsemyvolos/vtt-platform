import { randomUUID } from 'crypto';
import type { AssetDTO } from '@vtt/shared';
import type { Asset } from '@prisma/client';
import type { AIProvider, GeneratedBinary } from '../infrastructure/ai/AIProvider.js';
import type { FileStorageAdapter } from '../infrastructure/storage/FileStorageAdapter.js';
import { AssetRepository } from '../repositories/AssetRepository.js';
import { HttpError } from '../lib/errors.js';

/**
 * Coordinator over `AIProvider`, `FileStorageAdapter` and `AssetRepository` (§2.13.4).
 * Sequence А.7 (Process_View_AIImage):
 *   AIProvider returns bytes ──┐
 *                              ├─► par-block: storage.put(bytes) ‖ repo.create(metadata)
 *                              └─► presigned URL is generated for response.
 *
 * Persistence rule (§2.16): only `storageKey` is stored; clients always receive
 * a short-lived presigned URL (TTL = 15 min) — `storageKey` never crosses the
 * server boundary.
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

export class AssetService {
  constructor(
    private readonly ai: AIProvider,
    private readonly storage: FileStorageAdapter,
    private readonly repo: AssetRepository,
  ) {}

  /**
   * Persists an AI-generated binary: uploads bytes to GCS and records metadata.
   * Per sequence А.7 the upload and the DB insert are performed in parallel
   * (the `par` fragment is executed by `Promise.all`).
   *
   * @param userId owner of the asset
   * @param roomId room scope (cascade-deleted with the room)
   * @param payload bytes + mimeType from AIProvider
   * @returns the persisted Asset row
   */
  async storeAiAsset(
    userId: string,
    roomId: string,
    payload: GeneratedBinary,
    kind: 'image' | 'audio',
  ): Promise<Asset> {
    const storageKey = buildStorageKey(roomId, kind, payload.mimeType);
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
      }),
    ]);
    return asset;
  }

  /**
   * @param assetId Asset UUID
   * @returns AssetDTO with `url` materialized as presigned GCS URL (TTL 15 min)
   * @throws HttpError 404 if asset is missing
   */
  async getAssetDTO(assetId: string): Promise<AssetDTO> {
    const asset = await this.repo.findById(assetId);
    if (!asset) throw new HttpError(404, 'Asset not found');
    const url = await this.storage.getPresignedUrl(asset.storageKey);
    return {
      id: asset.id,
      url,
      type: asset.mimeType,
      name: asset.storageKey.split('/').pop() ?? asset.id,
      roomId: asset.roomId,
    };
  }

  /**
   * @param storageKey persistence key
   * @returns presigned URL (TTL 15 min)
   */
  presignedUrlFor(storageKey: string): Promise<string> {
    return this.storage.getPresignedUrl(storageKey);
  }
}
