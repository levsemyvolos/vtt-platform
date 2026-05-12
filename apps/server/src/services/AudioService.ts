import { randomUUID } from 'crypto';
import type { Asset, AudioTrack } from '@prisma/client';
import {
  AUDIO_ALLOWED_MIME,
  AUDIO_MAX_BYTES,
  type AudioLayer,
  type Role,
  type AudioFinalizeRequest,
  type AudioMime,
  type AudioPatchRequest,
  type AudioTrackDTO,
  type AudioTrackFromAssetRequest,
  type AudioUploadInitRequest,
  type AudioUploadInitResponse,
} from '@vtt/shared';
import type { AudioPlayPayload } from '@vtt/shared';
import type {
  FileStorageAdapter,
  PresignedUploadResult,
} from '../infrastructure/storage/FileStorageAdapter.js';
import type { AssetRepository } from '../repositories/AssetRepository.js';
import type { AudioTrackRepository } from '../repositories/AudioTrackRepository.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';
import type { SceneRepository } from '../repositories/SceneRepository.js';
import { AssetService } from './AssetService.js';
import { HttpError } from '../lib/errors.js';

const MIME_EXTENSION: Record<AudioMime, string> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
};

function isAllowedMime(mime: string): mime is AudioMime {
  return (AUDIO_ALLOWED_MIME as readonly string[]).includes(mime);
}

function buildAudioStorageKey(roomId: string, mimeType: AudioMime): string {
  return `rooms/${roomId}/audio/${randomUUID()}.${MIME_EXTENSION[mimeType]}`;
}

/**
 * Build a `kind: 'persistent'` or `kind: 'sfx'` play payload.
 * SFX tracks use the sfx arm (no startedAt, no loop, no fadeMs).
 */
function buildPlayPayload(
  action: 'play' | 'switch',
  layer: AudioLayer,
  trackId: string,
  sceneId: string | null,
  loop: boolean,
  fadeMs: number,
): AudioPlayPayload {
  if (layer === 'sfx') {
    return { kind: 'sfx', trackId, sceneId };
  }
  return { kind: 'persistent', layer, action, trackId, sceneId, loop, fadeMs, startedAt: Date.now() };
}

/**
 * Build a `kind: 'persistent'` stop payload for music/ambient layers.
 * SFX are fire-and-forget so a stop broadcast is meaningless; fall back to 'music'.
 * `fadeMs` is the fade-out duration in ms (track.fadeMs or default 1500).
 */
function buildStopPayload(layer: AudioLayer, fadeMs: number): AudioPlayPayload {
  const persistentLayer: Exclude<AudioLayer, 'sfx'> = layer === 'sfx' ? 'music' : layer;
  return { kind: 'persistent', layer: persistentLayer, action: 'stop', fadeMs, startedAt: Date.now() };
}

type TrackUpdate = {
  title?: string;
  loop?: boolean;
  sceneId?: string | null;
  fadeMs?: number;
  layer?: AudioLayer;
};

/** Sink for `audio:play` broadcasts — abstracted to keep the service WSS-agnostic. */
export type AudioBroadcaster = (roomId: string, payload: AudioPlayPayload) => void;

/** Per-room current-playing state for late-joiner resync (T1 / Task 4). */
export interface RoomAudioState {
  music: AudioPlayPayload | null;
  ambient: AudioPlayPayload | null;
}

/**
 * Coordinator over `AudioTrackRepository`, `AssetRepository` and
 * `FileStorageAdapter` for the music-track feature (Ф6, §2.13.4).
 *
 * Upload flow (presigned-PUT):
 *   1. `initUpload`  → mint presigned PUT URL + opaque storageKey
 *   2. client PUTs bytes directly to GCS (server out of the data path)
 *   3. `finalizeUpload` → verify object metadata, create Asset + AudioTrack
 *
 * Authorisation: only the room owner (GM) may upload, edit, delete or bind
 * tracks (§2.18 RBAC matrix). REST handlers must call `assertRoomOwner`
 * before any write.
 */
export class AudioService {
  /** In-memory cache of the last-broadcast persistent payload per room/layer. */
  private readonly currentByRoom = new Map<string, RoomAudioState>();

  constructor(
    private readonly tracks: AudioTrackRepository,
    private readonly assets: AssetRepository,
    private readonly storage: FileStorageAdapter,
    private readonly rooms: RoomRepository,
    private readonly scenes: SceneRepository,
    private readonly broadcast: AudioBroadcaster,
  ) {}

  // ─── audio state cache ────────────────────────────────────────────────────

  /**
   * Broadcast a payload to the room AND update the in-memory current-state
   * cache so late-joiners can resync on `session:resync` (Task 4).
   * SFX payloads are forwarded but never cached — they are fire-and-forget.
   */
  private emit(roomId: string, payload: AudioPlayPayload): void {
    this.broadcast(roomId, payload);
    this.updateCurrent(roomId, payload);
  }

  private updateCurrent(roomId: string, payload: AudioPlayPayload): void {
    if (payload.kind !== 'persistent') return; // SFX never cached
    const entry = this.currentByRoom.get(roomId) ?? { music: null, ambient: null };
    entry[payload.layer] = payload.action === 'stop' ? null : payload;
    this.currentByRoom.set(roomId, entry);
  }

  /** Returns the last broadcast persistent state for music + ambient layers. */
  getCurrentForRoom(roomId: string): RoomAudioState {
    return this.currentByRoom.get(roomId) ?? { music: null, ambient: null };
  }

  // ─── public playback helpers (REST routes) ────────────────────────────────

  /**
   * Manually trigger playback of a track (GM REST: POST /audio/:id/play).
   * Broadcasts `audio:play` to the room and updates the in-memory state cache.
   */
  async playTrack(track: AudioTrack): Promise<void> {
    const layer = track.layer as AudioLayer;
    const payload = buildPlayPayload('play', layer, track.id, track.sceneId, track.loop, track.fadeMs);
    this.emit(track.roomId, payload);
  }

  /**
   * Stop a persistent layer (GM REST: POST /audio/rooms/:roomId/stop).
   * Uses a 1500 ms default fade-out.
   */
  async stopLayer(roomId: string, layer: 'music' | 'ambient'): Promise<void> {
    const payload = buildStopPayload(layer, 1500);
    this.emit(roomId, payload);
  }

  /**
   * @throws HttpError 403 if `userId` is not the room owner; 404 if room missing.
   */
  async assertRoomOwner(roomId: string, userId: string): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new HttpError(404, 'Room not found');
    if (room.ownerId !== userId) {
      throw new HttpError(403, 'Only the GM (room owner) can manage audio tracks');
    }
  }

  async assertRoomAccess(
    roomId: string,
    userId: string,
    jwtRole: Role,
    boundRoomId?: string,
  ): Promise<Role> {
    const role = await this.rooms.getRoleInRoom(roomId, userId, jwtRole, boundRoomId);
    if (!role) throw new HttpError(403, 'Not a room member');
    return role;
  }

  /**
   * Step 1 of upload — validates MIME/size and mints a 15-min presigned PUT URL.
   * Caller must have already passed `assertRoomOwner`.
   */
  async initUpload(req: AudioUploadInitRequest): Promise<AudioUploadInitResponse> {
    if (!isAllowedMime(req.mimeType)) {
      throw new HttpError(415, `Unsupported audio MIME: ${req.mimeType}`);
    }
    if (!Number.isFinite(req.size) || req.size <= 0) {
      throw new HttpError(400, 'size must be a positive number');
    }
    if (req.size > AUDIO_MAX_BYTES) {
      throw new HttpError(413, `Audio file exceeds ${AUDIO_MAX_BYTES} bytes (НФВ 6.3)`);
    }
    const storageKey = buildAudioStorageKey(req.roomId, req.mimeType);
    const result: PresignedUploadResult = await this.storage.getPresignedUploadUrl({
      storageKey,
      mimeType: req.mimeType,
    });
    return {
      uploadUrl: result.uploadUrl,
      storageKey,
      expiresAt: result.expiresAt.toISOString(),
    };
  }

  /**
   * Step 3 of upload — verifies that the client really completed the PUT
   * within the size/MIME the signed URL permitted, then persists Asset and
   * AudioTrack rows. If `sceneId` is passed and matches the room, broadcasts
   * `audio:play` immediately (Ф6.3 + Ф6.4).
   *
   * @returns persisted AudioTrack row (DTO is built in the route layer where
   *          the playback URL is freshly presigned).
   */
  async finalizeUpload(req: AudioFinalizeRequest, ownerId: string): Promise<AudioTrack> {
    this.validateFinalizeRequest(req);
    const objectSize = await this.verifyUploadedObject(req.storageKey, req.mimeType as AudioMime);

    const sceneId = await this.resolveSceneBinding(req.roomId, req.sceneId ?? null);

    const asset = await this.assets.create({
      id: randomUUID(),
      ownerId,
      roomId: req.roomId,
      mimeType: req.mimeType,
      size: BigInt(objectSize),
      storageKey: req.storageKey,
    });
    const layer: AudioLayer = req.layer ?? 'music';
    const track = await this.tracks.create({
      id: randomUUID(),
      roomId: req.roomId,
      sceneId,
      assetId: asset.id,
      title: req.title.trim().slice(0, 128),
      loop: req.loop ?? false,
      fadeMs: req.fadeMs != null ? Math.max(0, Math.min(10000, req.fadeMs)) : 1500,
      layer,
    });

    if (sceneId) {
      this.emit(req.roomId, buildPlayPayload('play', track.layer as AudioLayer, track.id, sceneId, track.loop, track.fadeMs));
    }
    return track;
  }

  /**
   * S5.4 — register an existing AI-generated audio Asset as a playable
   * AudioTrack. Skips the upload-init/finalize round-trip because the Asset
   * already lives in GCS (created by `AIService.generateMusic`).
   *
   * Validates: asset exists, belongs to `req.roomId`, source='AI_AUDIO',
   * MIME is in the audio allow-list. Caller must have already passed
   * `assertRoomOwner`.
   *
   * If `req.playImmediately` is true, broadcasts `audio:play` after creation
   * even when the track has no scene binding (one-click "Play now" UX).
   */
  async createTrackFromAsset(req: AudioTrackFromAssetRequest): Promise<AudioTrack> {
    const asset = await this.assets.findById(req.assetId);
    this.validateAssetForTrack(asset, req);

    const sceneId = await this.resolveSceneBinding(req.roomId, req.sceneId ?? null);
    const layer: AudioLayer = req.layer ?? 'music';

    // S5.5 P5 — idempotency: a repeated Save click (or duplicate request from
    // a parallel UI surface) on the same (room, asset, scene, layer) tuple
    // returns the existing row instead of creating a clone. The freshly-
    // generated audio asset on Vertex is unique per generation, so this is a
    // safe natural key for "user pressed Save twice."
    const existing = await this.tracks.findByRoomAssetSceneLayer(
      req.roomId,
      asset!.id,
      sceneId,
      layer,
    );
    if (existing) {
      if (req.playImmediately) {
        this.emit(
          req.roomId,
          buildPlayPayload('play', layer, existing.id, sceneId, existing.loop, existing.fadeMs),
        );
      }
      return existing;
    }

    const track = await this.tracks.create({
      id: randomUUID(),
      roomId: req.roomId,
      sceneId,
      assetId: asset!.id,
      title: req.title.trim().slice(0, 128),
      loop: req.loop ?? false,
      fadeMs: req.fadeMs != null ? Math.max(0, Math.min(10000, req.fadeMs)) : 1500,
      layer,
    });

    // Scene-bound creation auto-broadcasts (mirrors finalizeUpload). One-click
    // "Play now" forces a broadcast regardless of binding.
    if (sceneId || req.playImmediately) {
      this.emit(
        req.roomId,
        buildPlayPayload('play', layer, track.id, sceneId, track.loop, track.fadeMs),
      );
    }
    return track;
  }

  /** Throws HttpError on any failed precondition; narrows asset to non-null on success. */
  private validateAssetForTrack(
    asset: Asset | null,
    req: AudioTrackFromAssetRequest,
  ): asserts asset is Asset {
    if (!asset) throw new HttpError(404, 'Asset not found');
    if (asset.roomId !== req.roomId) {
      throw new HttpError(403, 'Asset does not belong to this room');
    }
    if (asset.source !== 'AI_AUDIO') {
      throw new HttpError(400, 'Asset is not AI-generated audio');
    }
    if (!isAllowedMime(asset.mimeType)) {
      throw new HttpError(400, `Asset MIME ${asset.mimeType} is not in the audio allow-list`);
    }
    if (!req.title || req.title.trim().length === 0) {
      throw new HttpError(400, 'title is required');
    }
  }

  /**
   * Mutates a track's title/loop/scene-binding. When `sceneId` is supplied
   * (including `null` for unbind) the service emits `audio:play` so all
   * connected clients pick up the new state in realtime.
   */
  async patchTrack(trackId: string, patch: AudioPatchRequest): Promise<AudioTrack> {
    const existing = await this.tracks.findById(trackId);
    if (!existing) throw new HttpError(404, 'Track not found');

    const update: TrackUpdate = {};
    this.updateTitle(patch, update);
    this.updateLoop(patch, update);
    await this.updateBinding(patch, update, existing.roomId);
    this.updateFadeMs(patch, update);
    this.updateLayer(patch, update);

    const track = await this.tracks.update(trackId, update);

    // Broadcast only when the binding, the loop flag, or the layer actually changed —
    // a title-only edit doesn't affect playback.
    const sceneChanged = patch.sceneId !== undefined && update.sceneId !== existing.sceneId;
    const loopChanged = update.loop !== undefined && update.loop !== existing.loop;
    const layerChanged = update.layer !== undefined && update.layer !== existing.layer;
    if (sceneChanged || loopChanged || layerChanged) {
      if (track.sceneId) {
        this.emit(
          track.roomId,
          buildPlayPayload('play', track.layer as AudioLayer, track.id, track.sceneId, track.loop, track.fadeMs),
        );
      } else {
        this.emit(track.roomId, buildStopPayload(track.layer as AudioLayer, track.fadeMs));
      }
    }
    return track;
  }

  async deleteTrack(trackId: string): Promise<void> {
    const existing = await this.tracks.findById(trackId);
    if (!existing) throw new HttpError(404, 'Track not found');
    const asset = await this.assets.findById(existing.assetId);
    await this.tracks.deleteById(trackId);

    // S5.5 P4 — AI-generated assets live in the room-level AI library and may
    // back several tracks (same Asset registered as music, ambient, or in a
    // different scene). Deleting the track must NOT remove the Asset — that
    // would silently wipe the AI history. Uploaded tracks keep the original
    // 1:1 cascade since their Asset has no other purpose.
    if (asset && asset.source !== 'AI_AUDIO') {
      await this.assets.deleteById(asset.id);
      await this.storage.delete(asset.storageKey);
    }

    if (existing.sceneId) {
      this.emit(existing.roomId, buildStopPayload(existing.layer as AudioLayer, existing.fadeMs ?? 1500));
    }
  }

  async listByRoom(roomId: string): Promise<AudioTrack[]> {
    return this.tracks.listByRoom(roomId);
  }

  /**
   * @throws HttpError 404 if no track with that id.
   */
  async getById(trackId: string): Promise<AudioTrack> {
    const track = await this.tracks.findById(trackId);
    if (!track) throw new HttpError(404, 'Track not found');
    return track;
  }

  /**
   * Builds the public-facing DTO for one track. Generates a fresh presigned
   * playback URL each call (TTL 15 min, НФВ 4.5).
   */
  async toDTO(track: AudioTrack): Promise<AudioTrackDTO> {
    const asset = await this.assets.findById(track.assetId);
    if (!asset) throw new HttpError(500, 'AudioTrack references a missing Asset');
    return {
      id: track.id,
      roomId: track.roomId,
      sceneId: track.sceneId,
      title: track.title,
      url: AssetService.getProxyUrl(track.assetId),
      mimeType: asset.mimeType,
      loop: track.loop,
      fadeMs: track.fadeMs,
      layer: track.layer as AudioLayer,
      createdAt: track.createdAt.toISOString(),
    };
  }

  /**
   * Hook for scene-activation (Ф6.4): for each persistent layer (music, ambient)
   * broadcast `audio:play/switch` for the track bound to the new scene, or
   * `audio:stop` when the scene has none. Always emits exactly two broadcasts
   * (one per persistent layer) so both layers stay in sync with the new scene.
   */
  async handleSceneSwitch(roomId: string, sceneId: string): Promise<void> {
    const tracks = await this.tracks.findActiveTracksForScene(sceneId);
    const byLayer = new Map<AudioLayer, AudioTrack>();
    for (const t of tracks) {
      const layer = t.layer as AudioLayer;
      if (layer === 'sfx') continue; // SFX never auto-plays on scene switch
      if (!byLayer.has(layer)) byLayer.set(layer, t);
    }
    for (const layer of ['music', 'ambient'] as const) {
      const t = byLayer.get(layer);
      if (t) {
        this.emit(
          roomId,
          buildPlayPayload('switch', layer, t.id, t.sceneId, t.loop, t.fadeMs),
        );
      } else {
        this.emit(roomId, buildStopPayload(layer, 1500));
      }
    }
  }

  // ─── private helpers ───────────────────────────────────────────────────────

  /**
   * Validates the incoming finalizeUpload request (MIME, size, storageKey
   * prefix, title) before any I/O. Cyclomatic complexity ≤ 5.
   */
  private validateFinalizeRequest(req: AudioFinalizeRequest): void {
    if (!isAllowedMime(req.mimeType)) {
      throw new HttpError(415, `Unsupported audio MIME: ${req.mimeType}`);
    }
    if (req.size > AUDIO_MAX_BYTES) {
      throw new HttpError(413, `Audio file exceeds ${AUDIO_MAX_BYTES} bytes (НФВ 6.3)`);
    }
    const expectedPrefix = `rooms/${req.roomId}/audio/`;
    if (!req.storageKey.startsWith(expectedPrefix)) {
      throw new HttpError(400, 'storageKey does not belong to this room');
    }
    if (!req.title || req.title.trim().length === 0) {
      throw new HttpError(400, 'title is required');
    }
  }

  /**
   * Checks that the GCS object matching `storageKey` actually exists and has
   * the expected MIME. Deletes the orphan object on mismatch.
   * Cyclomatic complexity ≤ 4.
   */
  /** Returns verified object size in bytes. Deletes orphan on mismatch. */
  private async verifyUploadedObject(storageKey: string, mimeType: AudioMime): Promise<number> {
    const stat = await this.storage.statObject(storageKey);
    if (!stat) throw new HttpError(409, 'Upload was not completed');
    if (stat.size > AUDIO_MAX_BYTES) {
      // Defence-in-depth: signed URL pins MIME but not size.
      await this.storage.delete(storageKey);
      throw new HttpError(413, `Uploaded object exceeds ${AUDIO_MAX_BYTES} bytes`);
    }
    if (stat.contentType !== mimeType) {
      await this.storage.delete(storageKey);
      throw new HttpError(415, 'Uploaded object MIME does not match declared MIME');
    }
    return stat.size;
  }

  private updateTitle(patch: AudioPatchRequest, update: TrackUpdate): void {
    if (typeof patch.title === 'string') {
      const trimmed = patch.title.trim();
      if (trimmed.length === 0) throw new HttpError(400, 'title cannot be empty');
      update.title = trimmed.slice(0, 128);
    }
  }

  private updateLoop(patch: AudioPatchRequest, update: TrackUpdate): void {
    if (typeof patch.loop === 'boolean') update.loop = patch.loop;
  }

  private async updateBinding(
    patch: AudioPatchRequest,
    update: TrackUpdate,
    roomId: string,
  ): Promise<void> {
    if (patch.sceneId !== undefined) {
      update.sceneId = await this.resolveSceneBinding(roomId, patch.sceneId);
    }
  }

  private updateFadeMs(patch: AudioPatchRequest, update: TrackUpdate): void {
    if (typeof patch.fadeMs === 'number') {
      if (!Number.isInteger(patch.fadeMs) || patch.fadeMs < 0 || patch.fadeMs > 10000) {
        throw new HttpError(400, 'fadeMs must be an integer in range 0–10000');
      }
      update.fadeMs = patch.fadeMs;
    }
  }

  private updateLayer(patch: AudioPatchRequest, update: TrackUpdate): void {
    if (patch.layer !== undefined) update.layer = patch.layer;
  }

  /**
   * Validates that `sceneId` (when not null/undefined) belongs to `roomId`.
   * Returns the same id (or null) — passes through the unbind case.
   */
  private async resolveSceneBinding(
    roomId: string,
    sceneId: string | null,
  ): Promise<string | null> {
    if (!sceneId) return null;
    const scene = await this.scenes.findById(sceneId);
    if (!scene) throw new HttpError(404, 'Scene not found');
    if (scene.roomId !== roomId) {
      throw new HttpError(400, 'Scene does not belong to this room');
    }
    return sceneId;
  }
}
