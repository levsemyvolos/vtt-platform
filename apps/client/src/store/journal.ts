import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  JournalEntryDTO,
  JournalCreateRequest,
  JournalUpdateRequest,
  JournalGrantRequest,
} from '@vtt/shared';
import {
  listJournalEntries,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
  grantJournalEntry,
} from '../api/journal';

interface JournalState {
  entries: JournalEntryDTO[];
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
}

const initialState: JournalState = { entries: [], status: 'idle', error: null };

export const loadEntries = createAsyncThunk<
  JournalEntryDTO[],
  string,
  { rejectValue: string }
>('journal/load', async (roomId, { rejectWithValue }) => {
  try {
    return await listJournalEntries(roomId);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка завантаження');
  }
});

export const createEntryThunk = createAsyncThunk<
  JournalEntryDTO,
  { roomId: string; req: JournalCreateRequest },
  { rejectValue: string }
>('journal/create', async ({ roomId, req }, { rejectWithValue }) => {
  try {
    return await createJournalEntry(roomId, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося створити');
  }
});

export const updateEntryThunk = createAsyncThunk<
  JournalEntryDTO,
  { id: string; req: JournalUpdateRequest },
  { rejectValue: string }
>('journal/update', async ({ id, req }, { rejectWithValue }) => {
  try {
    return await updateJournalEntry(id, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося оновити');
  }
});

export const deleteEntryThunk = createAsyncThunk<
  string,
  string,
  { rejectValue: string }
>('journal/delete', async (id, { rejectWithValue }) => {
  try {
    await deleteJournalEntry(id);
    return id;
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося видалити');
  }
});

export const grantEntryThunk = createAsyncThunk<
  JournalEntryDTO,
  { id: string; req: JournalGrantRequest },
  { rejectValue: string }
>('journal/grant', async ({ id, req }, { rejectWithValue }) => {
  try {
    return await grantJournalEntry(id, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося поділитися');
  }
});

const slice = createSlice({
  name: 'journal',
  initialState,
  reducers: {
    upsertEntry: (state, action: PayloadAction<JournalEntryDTO>) => {
      const idx = state.entries.findIndex((e) => e.id === action.payload.id);
      if (idx === -1) state.entries.push(action.payload);
      else state.entries[idx] = action.payload;
    },
    removeEntry: (state, action: PayloadAction<string>) => {
      state.entries = state.entries.filter((e) => e.id !== action.payload);
    },
    clearJournal: () => initialState,
  },
  extraReducers: (b) => {
    b
      .addCase(loadEntries.pending, (s) => {
        s.status = 'loading';
        s.error = null;
      })
      .addCase(loadEntries.fulfilled, (s, a) => {
        s.status = 'loaded';
        s.entries = a.payload;
      })
      .addCase(loadEntries.rejected, (s, a) => {
        s.status = 'error';
        s.error = a.payload ?? 'Помилка';
      })
      .addCase(createEntryThunk.fulfilled, (s, a) => {
        const idx = s.entries.findIndex((e) => e.id === a.payload.id);
        if (idx === -1) s.entries.unshift(a.payload);
        else s.entries[idx] = a.payload;
      })
      .addCase(updateEntryThunk.fulfilled, (s, a) => {
        const idx = s.entries.findIndex((e) => e.id === a.payload.id);
        if (idx !== -1) s.entries[idx] = a.payload;
      })
      .addCase(deleteEntryThunk.fulfilled, (s, a) => {
        s.entries = s.entries.filter((e) => e.id !== a.payload);
      })
      .addCase(grantEntryThunk.fulfilled, (s, a) => {
        const idx = s.entries.findIndex((e) => e.id === a.payload.id);
        if (idx !== -1) s.entries[idx] = a.payload;
      });
  },
});

export const { upsertEntry, removeEntry, clearJournal } = slice.actions;
export default slice.reducer;
