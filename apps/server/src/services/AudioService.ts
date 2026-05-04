import { randomUUID } from 'crypto';
import type { AudioTrack } from '@prisma/client';
import {
  AUDIO_ALLOWED_MIME,
  AUDIO_MAX_BYTES,
  type Role,
  type AudioFinalizeRequest,
  type AudioMime,
  type AudioPatchRequest,
  type AudioTrackDTO,
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
import { HttpError } from '../lib/errors.js';

const MIME_EXTENSION: Record<AudioMime, string> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
};

function isAllowedMime(mime: string): mime is AudioMime {
  return (AUDIO_ALLOWED_MIME as readonly string[]).includes(mime);
}

function buildAudioStorageKey(roomId: string, mimeType: AudioMime): string {
  return `rooms/${roomId}/audio/${randomUUID()}.${MIME_EXTENSION[mimeType]}`;
}

type TrackUpdate = {
  title?: string;
  loop?: boolean;
  sceneId?: string | null;
  fadeMs?: number;
};

/** Sink for `audio:play` broadcasts — abstracted to keep the service WSS-agnostic. */
export type AudioBroadcaster = (roomId: string, payload: AudioPlayPayload) => void;

/**
 * Coordinator over `AudioTrackRepository`, `AssetRepository` and
 * `FileStorageAdapter` for the music-track feature (Ф6, §2.13.4).
 *
 * Upload flow (presigned-PUT, consistent with Чат 5 sequence А.7):
 *   1. `initUpload`  → mint presigned PUT URL + opaque storageKey
 *   2. client PUTs bytes directly to GCS (server out of the data path)
 *   3. `finalizeUpload` → verify object metadata, create Asset + AudioTrack
 *
 * Authorisation: only the room owner (GM) may upload, edit, delete or bind
 * tracks (§2.18 RBAC matrix). REST handlers must call `assertRoomOwner`
 * before any write.
 */
export class AudioService {
  constructor(
    private readonly tracks: AudioTrackRepository,
    private readonly assets: AssetRepository,
    private readonly storage: FileStorageAdapter,
    private readonly rooms: RoomRepository,
    private readonly scenes: SceneRepository,
    private readonly broadcast: AudioBroadcaster,
  ) {}

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
    const track = await this.tracks.create({
      id: randomUUID(),
      roomId: req.roomId,
      sceneId,
      assetId: asset.id,
      title: req.title.trim().slice(0, 128),
      loop: req.loop ?? false,
      fadeMs: req.fadeMs != null ? Math.max(0, Math.min(10000, req.fadeMs)) : 1500,
    });

    if (sceneId) {
      this.broadcast(req.roomId, {
        action: 'play',
        trackId: track.id,
        sceneId,
        loop: track.loop,
        startedAt: Date.now(),
      });
    }
    return track;
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

    const track = await this.tracks.update(trackId, update);

    // Broadcast only when the binding or the loop flag actually changed —
    // a title-only edit doesn't affect playback.
    const sceneChanged = patch.sceneId !== undefined && update.sceneId !== existing.sceneId;
    const loopChanged = update.loop !== undefined && update.loop !== existing.loop;
    if (sceneChanged || loopChanged) {
      if (track.sceneId) {
        this.broadcast(track.roomId, {
          action: 'play',
          trackId: track.id,
          sceneId: track.sceneId,
          loop: track.loop,
          startedAt: Date.now(),
        });
      } else {
        this.broadcast(track.roomId, { action: 'stop', startedAt: Date.now() });
      }
    }
    return track;
  }

  async deleteTrack(trackId: string): Promise<void> {
    const existing = await this.tracks.findById(trackId);
    if (!existing) throw new HttpError(404, 'Track not found');
    // Cascade: storageKey is opaque to clients per НФВ 4.5 — we look it up
    // through the Asset row and remove the GCS object too.
    const asset = await this.assets.findById(existing.assetId);
    await this.tracks.deleteById(trackId);
    if (asset) {
      await this.assets.deleteById(asset.id);
      await this.storage.delete(asset.storageKey);
    }
    if (existing.sceneId) {
      this.broadcast(existing.roomId, { action: 'stop', startedAt: Date.now() });
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
    const url = await this.storage.getPresignedUrl(asset.storageKey);
    return {
      id: track.id,
      roomId: track.roomId,
      sceneId: track.sceneId,
      title: track.title,
      url,
      mimeType: asset.mimeType,
      loop: track.loop,
      fadeMs: track.fadeMs,
      createdAt: track.createdAt.toISOString(),
    };
  }

  /**
   * Hook for scene-activation (Ф6.4): broadcast either `audio:play` for the
   * track bound to the new scene or `audio:stop` when the scene has none.
   */
  async handleSceneSwitch(roomId: string, sceneId: string): Promise<void> {
    const track = await this.tracks.findActiveForScene(sceneId);
    if (track) {
      this.broadcast(roomId, {
        action: 'switch',
        trackId: track.id,
        sceneId: track.sceneId,
        loop: track.loop,
        startedAt: Date.now(),
      });
    } else {
      this.broadcast(roomId, { action: 'stop', startedAt: Date.now() });
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
