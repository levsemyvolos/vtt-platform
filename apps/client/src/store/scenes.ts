import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { SceneDTO, CreateSceneRequest } from '@vtt/shared';
import { apiFetch } from '../api/apiFetch';

interface ScenesState {
  list: SceneDTO[];
  status: 'idle' | 'loading' | 'error';
  error: string | null;
}

const initialState: ScenesState = {
  list: [],
  status: 'idle',
  error: null,
};

export const loadScenes = createAsyncThunk<SceneDTO[], string, { rejectValue: string }>(
  'scenes/load',
  async (roomId, { rejectWithValue }) => {
    try {
      return await apiFetch<SceneDTO[]>(`/api/rooms/${roomId}/scenes`);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося завантажити сцени');
    }
  },
);

export const createScene = createAsyncThunk<
  SceneDTO,
  { roomId: string; dto: CreateSceneRequest },
  { rejectValue: string }
>('scenes/create', async ({ roomId, dto }, { rejectWithValue }) => {
  try {
    return await apiFetch<SceneDTO>(`/api/rooms/${roomId}/scenes`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося створити сцену');
  }
});

export const activateScene = createAsyncThunk<void, string, { rejectValue: string }>(
  'scenes/activate',
  async (sceneId, { rejectWithValue }) => {
    try {
      await apiFetch<void>(`/api/scenes/${sceneId}/activate`, { method: 'POST' });
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося активувати сцену');
    }
  },
);

const scenesSlice = createSlice({
  name: 'scenes',
  initialState,
  reducers: {
    clearScenes: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadScenes.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadScenes.fulfilled, (state, action) => {
        state.status = 'idle';
        state.list = action.payload;
      })
      .addCase(loadScenes.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка';
      })
      .addCase(createScene.fulfilled, (state, action) => {
        state.list.push(action.payload);
      })
      .addCase(activateScene.fulfilled, (state, action) => {
        const sceneId = action.meta.arg;
        for (const s of state.list) {
          s.isActive = s.id === sceneId;
        }
      });
  },
});

export const { clearScenes } = scenesSlice.actions;
export default scenesSlice.reducer;
