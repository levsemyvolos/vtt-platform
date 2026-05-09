import type {
  AudioFinalizeRequest,
  AudioListResponse,
  AudioPatchRequest,
  AudioPlaybackUrlResponse,
  AudioTrackDTO,
  AudioTrackFromAssetRequest,
  AudioUploadInitRequest,
  AudioUploadInitResponse,
} from '@vtt/shared';
import { apiFetch } from './apiFetch';

export function listAudioTracks(roomId: string): Promise<AudioListResponse> {
  return apiFetch<AudioListResponse>(`/api/rooms/${roomId}/audio`);
}

export function initAudioUpload(
  req: AudioUploadInitRequest,
): Promise<AudioUploadInitResponse> {
  return apiFetch<AudioUploadInitResponse>('/api/audio/uploads', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function finalizeAudioUpload(
  req: AudioFinalizeRequest,
): Promise<AudioTrackDTO> {
  return apiFetch<AudioTrackDTO>('/api/audio', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/** S5.5 P7 — register an existing AI-audio Asset as a playable AudioTrack. */
export function createTrackFromAsset(
  req: AudioTrackFromAssetRequest,
): Promise<AudioTrackDTO> {
  return apiFetch<AudioTrackDTO>('/api/audio/from-asset', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function patchAudioTrack(
  trackId: string,
  patch: AudioPatchRequest,
): Promise<AudioTrackDTO> {
  return apiFetch<AudioTrackDTO>(`/api/audio/${trackId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function deleteAudioTrack(trackId: string): Promise<void> {
  return apiFetch<void>(`/api/audio/${trackId}`, { method: 'DELETE' });
}

export function getAudioPlaybackUrl(trackId: string): Promise<AudioPlaybackUrlResponse> {
  return apiFetch<AudioPlaybackUrlResponse>(`/api/audio/${trackId}/url`);
}

/** Manually play a track (GM REST: POST /audio/:id/play). */
export function playAudioTrack(trackId: string): Promise<void> {
  return apiFetch<void>(`/api/audio/${trackId}/play`, { method: 'POST' });
}

/** Stop a persistent layer (GM REST: POST /audio/rooms/:roomId/stop). */
export function stopAudioLayer(roomId: string, layer: 'music' | 'ambient'): Promise<void> {
  return apiFetch<void>(`/api/audio/rooms/${roomId}/stop`, {
    method: 'POST',
    body: JSON.stringify({ layer }),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Presigned-PUT to GCS — bypasses our application server (Чат 5 sequence А.7).
 * The signed URL pins `Content-Type`; sending a different MIME makes GCS reject.
 */
export async function uploadBytesToGcs(
  uploadUrl: string,
  file: File,
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!res.ok) {
    throw new Error(`GCS upload failed: ${res.status} ${res.statusText}`);
  }
}
