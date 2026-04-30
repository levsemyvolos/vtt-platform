import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { HandoutDTO, HandoutCreateRequest } from '@vtt/shared';
import {
  createHandout,
  deleteHandout,
  grantHandout,
  listHandouts,
  revokeHandout,
} from '../api/handouts';

interface HandoutsState {
  items: HandoutDTO[];
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
}

const initialState: HandoutsState = {
  items: [],
  status: 'idle',
  error: null,
};

export const loadHandouts = createAsyncThunk<
  HandoutDTO[],
  string,
  { rejectValue: string }
>('handouts/load', async (roomId, { rejectWithValue }) => {
  try {
    return await listHandouts(roomId);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося завантажити handouts');
  }
});

export const createHandoutThunk = createAsyncThunk<
  HandoutDTO,
  { roomId: string; req: HandoutCreateRequest },
  { rejectValue: string }
>('handouts/create', async ({ roomId, req }, { rejectWithValue }) => {
  try {
    return await createHandout(roomId, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося створити handout');
  }
});

export const grantHandoutThunk = createAsyncThunk<
  HandoutDTO,
  { handoutId: string; userIds: string[] },
  { rejectValue: string }
>('handouts/grant', async ({ handoutId, userIds }, { rejectWithValue }) => {
  try {
    return await grantHandout(handoutId, userIds);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося видати handout');
  }
});

export const revokeHandoutThunk = createAsyncThunk<
  HandoutDTO,
  { handoutId: string; userId: string },
  { rejectValue: string }
>('handouts/revoke', async ({ handoutId, userId }, { rejectWithValue }) => {
  try {
    return await revokeHandout(handoutId, userId);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося відкликати доступ');
  }
});

export const deleteHandoutThunk = createAsyncThunk<
  string,
  string,
  { rejectValue: string }
>('handouts/delete', async (handoutId, { rejectWithValue }) => {
  try {
    await deleteHandout(handoutId);
    return handoutId;
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося видалити handout');
  }
});

const handoutsSlice = createSlice({
  name: 'handouts',
  initialState,
  reducers: {
    clearHandouts: (state) => {
      state.items = [];
      state.status = 'idle';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadHandouts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadHandouts.fulfilled, (state, action) => {
        state.status = 'loaded';
        state.items = action.payload;
      })
      .addCase(loadHandouts.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка завантаження';
      })
      .addCase(createHandoutThunk.fulfilled, (state, action: PayloadAction<HandoutDTO>) => {
        state.items.push(action.payload);
      })
      .addCase(grantHandoutThunk.fulfilled, upsertHandout)
      .addCase(revokeHandoutThunk.fulfilled, upsertHandout)
      .addCase(deleteHandoutThunk.fulfilled, (state, action: PayloadAction<string>) => {
        state.items = state.items.filter((h) => h.id !== action.payload);
      });
  },
});

function upsertHandout(state: HandoutsState, action: PayloadAction<HandoutDTO>): void {
  const idx = state.items.findIndex((h) => h.id === action.payload.id);
  if (idx === -1) state.items.push(action.payload);
  else state.items[idx] = action.payload;
}

export const { clearHandouts } = handoutsSlice.actions;
export default handoutsSlice.reducer;
