/**
 * REST contracts for the music-track feature (Ф6).
 *
 * Upload uses a presigned-PUT flow consistent with the AI-storage adapter
 * introduced in Чат 5 (sequence А.7) — the client never sends raw bytes to
 * the application server; only the metadata round-trips.
 *
 *   1. POST /audio/uploads          → { uploadUrl, storageKey }     (GM)
 *   2. PUT  uploadUrl   (GCS)       → bytes (client → object store)
 *   3. POST /audio                  → { track }                      (GM, finalize)
 *   4. GET  /rooms/:id/audio        → { tracks[] }
 *   5. PATCH /audio/:id             → { track }                      (GM)
 *   6. DELETE /audio/:id            →                                (GM)
 *   7. GET  /audio/:id/url          → { url }   (presigned playback, TTL 15 min)
 */

export const AUDIO_MAX_BYTES = 50 * 1024 * 1024; // НФВ 6.3
export const AUDIO_ALLOWED_MIME = ['audio/mpeg', 'audio/ogg'] as const;
export type AudioMime = (typeof AUDIO_ALLOWED_MIME)[number];

export interface AudioTrackDTO {
  id: string;
  roomId: string;
  /** null = unbound (track exists but isn't tied to a particular scene yet). */
  sceneId: string | null;
  title: string;
  /** Presigned read URL (TTL = 15 min) for the underlying Asset. */
  url: string;
  mimeType: string;
  loop: boolean;
  /** Crossfade duration in milliseconds (1–10000). Default 1500. */
  fadeMs: number;
  createdAt: string;
}

export interface AudioUploadInitRequest {
  roomId: string;
  /** MIME of the file the client is about to PUT to GCS. */
  mimeType: AudioMime;
  /** Size in bytes — validated against `AUDIO_MAX_BYTES`. */
  size: number;
}

export interface AudioUploadInitResponse {
  /** Presigned PUT URL (TTL = 15 min). Client must use the same MIME on PUT. */
  uploadUrl: string;
  /**
   * Opaque key returned by the server — echoed back on `POST /audio` to bind
   * the upload to its persisted Asset row. Per НФВ 4.5 this string is opaque
   * to the client and must not be parsed.
   */
  storageKey: string;
  expiresAt: string;
}

export interface AudioFinalizeRequest {
  roomId: string;
  storageKey: string;
  mimeType: AudioMime;
  size: number;
  title: string;
  /** Bind to a scene at creation time; null/undefined = unbound. */
  sceneId?: string | null;
  loop?: boolean;
  /** Initial crossfade duration in milliseconds (1–10000). Default 1500. */
  fadeMs?: number;
}

export interface AudioPatchRequest {
  /** Pass `null` to unbind the track from any scene. */
  sceneId?: string | null;
  loop?: boolean;
  title?: string;
  /** Crossfade duration in milliseconds (1–10000). */
  fadeMs?: number;
}

export interface AudioListResponse {
  tracks: AudioTrackDTO[];
}

export interface AudioPlaybackUrlResponse {
  url: string;
}
