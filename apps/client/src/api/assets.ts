import type { AssetDTO } from '@vtt/shared';
import { apiFetch } from './apiFetch';

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // НФВ 6.2
export const IMAGE_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_ALLOWED_MIME)[number];

export function listRoomAssets(roomId: string): Promise<AssetDTO[]> {
  return apiFetch<AssetDTO[]>(`/api/assets?roomId=${encodeURIComponent(roomId)}&type=all`);
}

/** Re-fetches a single asset's DTO — used by the URL-refresh interceptor when a signed URL expires. */
export function getAssetById(assetId: string): Promise<AssetDTO> {
  return apiFetch<AssetDTO>(`/api/assets/${encodeURIComponent(assetId)}`);
}

/**
 * Uploads an image file directly through the server (no presigned GCS URL).
 * Server streams bytes to the private GCS bucket and returns the proxy AssetDTO.
 * Asset URL is always /api/assets/:id/file — never a storage.googleapis.com URL.
 */
export async function uploadImageAsset(roomId: string, file: File): Promise<AssetDTO> {
  const fd = new FormData();
  fd.append('roomId', roomId);
  fd.append('file', file);
  return apiFetch<AssetDTO>('/api/assets', { method: 'POST', body: fd });
}

/** Renames an asset's display name. storageKey is server-managed and never changes. */
export function renameAsset(assetId: string, name: string): Promise<AssetDTO> {
  return apiFetch<AssetDTO>(`/api/assets/${encodeURIComponent(assetId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}
