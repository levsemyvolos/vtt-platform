import { createSlice, createAsyncThunk, createAction, type PayloadAction } from '@reduxjs/toolkit';
import type { AudioPlayPayload, AudioTrackDTO, AudioLayer, AudioMime } from '@vtt/shared';
import { AUDIO_ALLOWED_MIME } from '@vtt/shared';
import {
  createTrackFromAsset,
  deleteAudioTrack,
  finalizeAudioUpload,
  initAudioUpload,
  listAudioTracks,
  patchAudioTrack,
  playAudioTrack,
  stopAudioLayer,
} from '../api/audio';
import { uploadWithProgress } from '../api/uploads';


interface VolumeMixer {
  master: number;
  music: number;
  ambient: number;
  sfx: number;
}

/**
 * Persistent payloads stored per layer for late-joiner resync.
 * SFX is fire-and-forget — never stored here.
 */
interface CurrentByLayer {
  music: AudioPlayPayload | null;
  ambient: AudioPlayPayload | null;
}

export interface SfxEvent {
  /** Client-side uuid for deduplication. */
  id: string;
  trackId: string;
  sceneId: string | null;
  receivedAt: number;
}

interface AudioState {
  /** All tracks of the current room (loaded once on session start). */
  tracks: AudioTrackDTO[];
  /**
   * Last `audio:play` payload received from the server, keyed by layer.
   * SFX is fire-and-forget — it goes to `pendingSfx` instead.
   */
  current: CurrentByLayer;
  /** Per-channel volume in [0..1]. */
  volume: VolumeMixer;
  /** Queue of SFX events waiting for the SFX pool to play them. */
  pendingSfx: SfxEvent[];
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
  /** Upload progress 0–100 while uploadAudioTrack is in-flight; null otherwise. */
  uploadProgress: number | null;
}

const SFX_QUEUE_CAP = 10;

const initialState: AudioState = {
  tracks: [],
  current: { music: null, ambient: null },
  volume: { master: 0.8, music: 1.0, ambient: 1.0, sfx: 1.0 },
  pendingSfx: [],
  status: 'idle',
  error: null,
  uploadProgress: null,
};

/** Standalone action so the uploadAudioTrack thunk can dispatch it before the slice is defined. */
export const setUploadProgress = createAction<number | null>('audio/uploadProgress');

/** Generate a lightweight session-unique id. Browser `crypto.randomUUID` is
 *  required; fallback to monotonic counter to keep ids unique within session
 *  (avoid Math.random per A1 invariant). */
let sfxCounter = 0;
function newSfxId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  sfxCounter += 1;
  return `sfx-${Date.now()}-${sfxCounter}`;
}

// ── thunks ─────────────────────────────────────────────────────────────────

export const loadAudioTracks = createAsyncThunk<
  AudioTrackDTO[],
  string,
  { rejectValue: string }
>('audio/load', async (roomId, { rejectWithValue }) => {
  try {
    const { tracks } = await listAudioTracks(roomId);
    return tracks;
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося завантажити треки');
  }
});

interface UploadArgs {
  roomId: string;
  file: File;
  title: string;
  layer: AudioLayer;
  sceneId?: string | null;
  loop?: boolean;
  fadeMs?: number;
}

/**
 * Three-step upload (Чат 7.2 Q3):
 *   1. POST /audio/uploads → presigned PUT URL + storageKey
 *   2. PUT bytes directly to GCS
 *   3. POST /audio → finalize, server creates Asset + AudioTrack
 *
 * MIME validation runs on both client (here) and server. The server is the
 * authority — НФВ 6.3 (50 МБ) is enforced there too.
 */
export const uploadAudioTrack = createAsyncThunk<
  AudioTrackDTO,
  UploadArgs,
  { rejectValue: string }
>('audio/upload', async ({ roomId, file, title, layer, sceneId, loop, fadeMs }, { rejectWithValue, dispatch }) => {
  try {
    if (!AUDIO_ALLOWED_MIME.includes(file.type as AudioMime)) {
      return rejectWithValue('Підтримуються лише MP3, OGG та WAV файли');
    }
    const mimeType = file.type as AudioMime;
    dispatch(setUploadProgress(0));
    const init = await initAudioUpload({
      roomId,
      mimeType,
      size: file.size,
    });
    await uploadWithProgress(init.uploadUrl, file, (p) => dispatch(setUploadProgress(p)));
    const dto = await finalizeAudioUpload({
      roomId,
      storageKey: init.storageKey,
      mimeType,
      size: file.size,
      title,
      layer,
      sceneId: sceneId ?? null,
      loop: loop ?? false,
      ...(fadeMs !== undefined ? { fadeMs } : {}),
    });
    dispatch(setUploadProgress(null));
    return dto;
  } catch (err) {
    dispatch(setUploadProgress(null));
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка завантаження');
  }
});

/**
 * S5.5 P7 — register an existing AI-audio Asset as a room AudioTrack and
 * insert it into the in-game music sidepanel. Server is idempotent on
 * (room, asset, scene, layer) so repeated calls are safe.
 */
export const addTrackFromAiAsset = createAsyncThunk<
  AudioTrackDTO,
  { roomId: string; assetId: string; title: string; layer: AudioLayer; sceneId: string | null; loop?: boolean },
  { rejectValue: string }
>('audio/addFromAi', async (args, { rejectWithValue }) => {
  try {
    return await createTrackFromAsset({
      roomId: args.roomId,
      assetId: args.assetId,
      title: args.title,
      layer: args.layer,
      sceneId: args.sceneId,
      loop: args.loop ?? false,
      playImmediately: false,
    });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося додати трек');
  }
});

export const bindTrackToScene = createAsyncThunk<
  AudioTrackDTO,
  { trackId: string; sceneId: string | null },
  { rejectValue: string }
>('audio/bind', async ({ trackId, sceneId }, { rejectWithValue }) => {
  try {
    return await patchAudioTrack(trackId, { sceneId });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося прив\'язати трек');
  }
});

export const patchTrackThunk = createAsyncThunk<
  AudioTrackDTO,
  { trackId: string; fadeMs?: number; loop?: boolean; title?: string; layer?: AudioLayer },
  { rejectValue: string }
>('audio/patch', async ({ trackId, ...patch }, { rejectWithValue }) => {
  try {
    return await patchAudioTrack(trackId, patch);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка оновлення треку');
  }
});

export const setTrackLoop = createAsyncThunk<
  AudioTrackDTO,
  { trackId: string; loop: boolean },
  { rejectValue: string }
>('audio/setLoop', async ({ trackId, loop }, { rejectWithValue }) => {
  try {
    return await patchAudioTrack(trackId, { loop });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка');
  }
});

export const removeAudioTrack = createAsyncThunk<
  string,
  string,
  { rejectValue: string }
>('audio/delete', async (trackId, { rejectWithValue }) => {
  try {
    await deleteAudioTrack(trackId);
    return trackId;
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка видалення');
  }
});

/**
 * Fire-and-forget: ask the server to broadcast `audio:play` for a track.
 * No local state change — the server-side broadcast comes back via `audio:play`
 * and is handled by `applyAudioPlay`.
 */
export const playTrackThunk = createAsyncThunk<void, string, { rejectValue: string }>(
  'audio/playTrack',
  async (trackId, { rejectWithValue }) => {
    try {
      await playAudioTrack(trackId);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Помилка відтворення');
    }
  },
);

/**
 * Fire-and-forget: ask the server to stop a persistent layer.
 * No local state change — the server-side broadcast comes back via `audio:play`
 * with `action: 'stop'` and is handled by `applyAudioPlay`.
 */
export const stopLayerThunk = createAsyncThunk<
  void,
  { roomId: string; layer: 'music' | 'ambient' },
  { rejectValue: string }
>('audio/stopLayer', async ({ roomId, layer }, { rejectWithValue }) => {
  try {
    await stopAudioLayer(roomId, layer);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка зупинки');
  }
});

// ── slice ───────────────────────────────────────────────────────────────────

const audioSlice = createSlice({
  name: 'audio',
  initialState,
  reducers: {
    /** Master volume — applies to all rendered audio before per-channel gain. */
    setMasterVolume: (state, action: PayloadAction<number>) => {
      state.volume.master = Math.max(0, Math.min(1, action.payload));
    },
    /** Per-layer volume — applies to a single channel after master gain. */
    setLayerVolume: (state, action: PayloadAction<{ layer: AudioLayer; v: number }>) => {
      const { layer, v } = action.payload;
      state.volume[layer] = Math.max(0, Math.min(1, v));
    },
    /**
     * Server → client `audio:play` event sink.
     *
     * - Persistent (music/ambient): stored in `current[layer]` for late-joiner resync.
     * - SFX: pushed to `pendingSfx` (capped at SFX_QUEUE_CAP; oldest dropped on overflow).
     */
    applyAudioPlay: (state, action: PayloadAction<AudioPlayPayload>) => {
      const payload = action.payload;
      if (payload.kind === 'persistent') {
        state.current[payload.layer] = payload;
      } else {
        // kind === 'sfx'
        const event: SfxEvent = {
          id: newSfxId(),
          trackId: payload.trackId,
          sceneId: payload.sceneId,
          receivedAt: Date.now(),
        };
        state.pendingSfx.push(event);
        if (state.pendingSfx.length > SFX_QUEUE_CAP) {
          state.pendingSfx.splice(0, state.pendingSfx.length - SFX_QUEUE_CAP);
        }
      }
    },
    /** AudioPlayer calls this once a pooled element finishes playing the SFX. */
    consumeSfx: (state, action: PayloadAction<string>) => {
      state.pendingSfx = state.pendingSfx.filter((e) => e.id !== action.payload);
    },
    clearAudio: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(setUploadProgress, (state, action) => {
        state.uploadProgress = action.payload;
      })
      .addCase(loadAudioTracks.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadAudioTracks.fulfilled, (state, action) => {
        state.status = 'loaded';
        state.tracks = action.payload;
      })
      .addCase(loadAudioTracks.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка завантаження';
      })
      .addCase(uploadAudioTrack.fulfilled, upsert)
      .addCase(addTrackFromAiAsset.fulfilled, upsert)
      .addCase(bindTrackToScene.fulfilled, upsert)
      .addCase(setTrackLoop.fulfilled, upsert)
      .addCase(patchTrackThunk.fulfilled, upsert)
      .addCase(removeAudioTrack.fulfilled, (state, action: PayloadAction<string>) => {
        state.tracks = state.tracks.filter((t) => t.id !== action.payload);
      });
  },
});

function upsert(state: AudioState, action: PayloadAction<AudioTrackDTO>): void {
  const idx = state.tracks.findIndex((t) => t.id === action.payload.id);
  if (idx === -1) state.tracks.push(action.payload);
  else state.tracks[idx] = action.payload;
}

export const {
  setMasterVolume,
  setLayerVolume,
  applyAudioPlay,
  consumeSfx,
  clearAudio,
} = audioSlice.actions;

export default audioSlice.reducer;
