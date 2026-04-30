import type { AssetDTO } from '@vtt/shared';
import { apiFetch } from './apiFetch';

export const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // НФВ 6.2
export const IMAGE_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageMime = (typeof IMAGE_ALLOWED_MIME)[number];

export interface ImageUploadInitRequest {
  roomId: string;
  mimeType: ImageMime;
  size: number;
}

export interface ImageUploadInitResponse {
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export interface ImageFinalizeRequest {
  roomId: string;
  storageKey: string;
  mimeType: ImageMime;
  size: number;
}

export function listRoomAssets(roomId: string): Promise<AssetDTO[]> {
  return apiFetch<AssetDTO[]>(`/api/rooms/${roomId}/assets`);
}

export function initImageUpload(req: ImageUploadInitRequest): Promise<ImageUploadInitResponse> {
  return apiFetch<ImageUploadInitResponse>('/api/assets/uploads', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function finalizeImageUpload(req: ImageFinalizeRequest): Promise<AssetDTO> {
  return apiFetch<AssetDTO>('/api/assets', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export async function uploadBytesToGcs(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) throw new Error(`GCS upload failed: ${res.status} ${res.statusText}`);
}
