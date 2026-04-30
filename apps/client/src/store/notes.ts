import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { NoteDTO, NoteCreateRequest, NoteUpdateRequest } from '@vtt/shared';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  updateNote,
} from '../api/notes';

interface NotesState {
  items: NoteDTO[];
  current: NoteDTO | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
}

const initialState: NotesState = {
  items: [],
  current: null,
  status: 'idle',
  error: null,
};

export const loadNotes = createAsyncThunk<
  NoteDTO[],
  string,
  { rejectValue: string }
>('notes/load', async (roomId, { rejectWithValue }) => {
  try {
    return await listNotes(roomId);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося завантажити нотатки');
  }
});

export const loadNote = createAsyncThunk<NoteDTO, string, { rejectValue: string }>(
  'notes/loadOne',
  async (id, { rejectWithValue }) => {
    try {
      return await getNote(id);
    } catch (err) {
      return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося відкрити нотатку');
    }
  },
);

export const createNoteThunk = createAsyncThunk<
  NoteDTO,
  { roomId: string; req: NoteCreateRequest },
  { rejectValue: string }
>('notes/create', async ({ roomId, req }, { rejectWithValue }) => {
  try {
    return await createNote(roomId, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося створити нотатку');
  }
});

export const updateNoteThunk = createAsyncThunk<
  NoteDTO,
  { id: string; req: NoteUpdateRequest },
  { rejectValue: string }
>('notes/update', async ({ id, req }, { rejectWithValue }) => {
  try {
    return await updateNote(id, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося оновити нотатку');
  }
});

export const deleteNoteThunk = createAsyncThunk<
  string,
  string,
  { rejectValue: string }
>('notes/delete', async (id, { rejectWithValue }) => {
  try {
    await deleteNote(id);
    return id;
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося видалити нотатку');
  }
});

const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    clearNotes: (state) => {
      state.items = [];
      state.current = null;
      state.status = 'idle';
      state.error = null;
    },
    setCurrentNote: (state, action: PayloadAction<NoteDTO | null>) => {
      state.current = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadNotes.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadNotes.fulfilled, (state, action) => {
        state.status = 'loaded';
        state.items = action.payload;
      })
      .addCase(loadNotes.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка завантаження';
      })
      .addCase(loadNote.fulfilled, (state, action) => {
        state.current = action.payload;
      })
      .addCase(createNoteThunk.fulfilled, (state, action) => {
        state.items.push(action.payload);
        state.current = action.payload;
      })
      .addCase(updateNoteThunk.fulfilled, (state, action) => {
        const idx = state.items.findIndex((n) => n.id === action.payload.id);
        if (idx !== -1) state.items[idx] = action.payload;
        if (state.current?.id === action.payload.id) state.current = action.payload;
      })
      .addCase(deleteNoteThunk.fulfilled, (state, action) => {
        state.items = state.items.filter((n) => n.id !== action.payload);
        if (state.current?.id === action.payload) state.current = null;
      });
  },
});

export const { clearNotes, setCurrentNote } = notesSlice.actions;
export default notesSlice.reducer;
