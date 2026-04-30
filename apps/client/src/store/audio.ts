import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { AudioPlayPayload, AudioTrackDTO } from '@vtt/shared';
import {
  deleteAudioTrack,
  finalizeAudioUpload,
  initAudioUpload,
  listAudioTracks,
  patchAudioTrack,
  uploadBytesToGcs,
} from '../api/audio';

/**
 * Per Q1 of session_chapter3_chat7_2 — fade duration is a client-side UI
 * constant, never persisted, never sent over the wire. Tweak here if the GM
 * later asks for a slower transition.
 */
export const AUDIO_FADE_MS = 1500;

interface AudioState {
  /** All tracks of the current room (loaded once on session start). */
  tracks: AudioTrackDTO[];
  /**
   * Last `audio:play` payload received from the server. The AudioPlayer
   * component reacts to this slot — when `current.action ∈ {play, switch}`
   * it (re)starts the bound `<audio>` with fade-in; on `stop` it fades out.
   */
  current: AudioPlayPayload | null;
  /** Local volume in the [0..1] range — UI-only, not synced. */
  volume: number;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
}

const initialState: AudioState = {
  tracks: [],
  current: null,
  volume: 0.6,
  status: 'idle',
  error: null,
};

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
  sceneId?: string | null;
  loop?: boolean;
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
>('audio/upload', async ({ roomId, file, title, sceneId, loop }, { rejectWithValue }) => {
  try {
    if (file.type !== 'audio/mpeg' && file.type !== 'audio/ogg') {
      return rejectWithValue('Лише MP3 (audio/mpeg) або OGG (audio/ogg)');
    }
    const init = await initAudioUpload({
      roomId,
      mimeType: file.type,
      size: file.size,
    });
    await uploadBytesToGcs(init.uploadUrl, file);
    const dto = await finalizeAudioUpload({
      roomId,
      storageKey: init.storageKey,
      mimeType: file.type,
      size: file.size,
      title,
      sceneId: sceneId ?? null,
      loop: loop ?? false,
    });
    return dto;
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка завантаження');
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

const audioSlice = createSlice({
  name: 'audio',
  initialState,
  reducers: {
    /** Server → client `audio:play` event sink. */
    applyAudioPlay: (state, action: PayloadAction<AudioPlayPayload>) => {
      state.current = action.payload;
    },
    setVolume: (state, action: PayloadAction<number>) => {
      state.volume = Math.max(0, Math.min(1, action.payload));
    },
    clearAudio: () => initialState,
  },
  extraReducers: (builder) => {
    builder
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
      .addCase(bindTrackToScene.fulfilled, upsert)
      .addCase(setTrackLoop.fulfilled, upsert)
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

export const { applyAudioPlay, setVolume, clearAudio } = audioSlice.actions;
export default audioSlice.reducer;
