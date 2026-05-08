import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  CharacterSheetDTO,
  CharacterCreateRequest,
  CharacterUpdateRequest,
} from '@vtt/shared';
import {
  createCharacter,
  getCharacter,
  listCharacters,
  updateCharacter,
  uploadCharacterPdf,
} from '../api/characters';

interface CharactersState {
  items: CharacterSheetDTO[];
  current: CharacterSheetDTO | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  error: string | null;
}

const initialState: CharactersState = {
  items: [],
  current: null,
  status: 'idle',
  error: null,
};

export const loadCharacters = createAsyncThunk<
  CharacterSheetDTO[],
  string,
  { rejectValue: string }
>('characters/load', async (roomId, { rejectWithValue }) => {
  try {
    return await listCharacters(roomId);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося завантажити персонажів');
  }
});

export const loadCharacter = createAsyncThunk<
  CharacterSheetDTO,
  string,
  { rejectValue: string }
>('characters/loadOne', async (id, { rejectWithValue }) => {
  try {
    return await getCharacter(id);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося відкрити аркуш');
  }
});

export const createCharacterThunk = createAsyncThunk<
  CharacterSheetDTO,
  { roomId: string; req: CharacterCreateRequest },
  { rejectValue: string }
>('characters/create', async ({ roomId, req }, { rejectWithValue }) => {
  try {
    return await createCharacter(roomId, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося створити персонажа');
  }
});

export const updateCharacterThunk = createAsyncThunk<
  CharacterSheetDTO,
  { id: string; req: CharacterUpdateRequest },
  { rejectValue: string }
>('characters/update', async ({ id, req }, { rejectWithValue }) => {
  try {
    return await updateCharacter(id, req);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося оновити аркуш');
  }
});

export const uploadPdfThunk = createAsyncThunk<
  CharacterSheetDTO,
  { id: string; file: File },
  { rejectValue: string }
>('characters/uploadPdf', async ({ id, file }, { rejectWithValue }) => {
  try {
    return await uploadCharacterPdf(id, file);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося завантажити PDF');
  }
});

const charactersSlice = createSlice({
  name: 'characters',
  initialState,
  reducers: {
    clearCharacters: (state) => {
      state.items = [];
      state.current = null;
      state.status = 'idle';
      state.error = null;
    },
    setCurrentCharacter: (state, action: PayloadAction<CharacterSheetDTO | null>) => {
      state.current = action.payload;
    },
    upsertCharacter: (state, action: PayloadAction<CharacterSheetDTO>) => {
      upsertItem(state, action.payload);
      if (state.current?.id === action.payload.id) state.current = action.payload;
    },
    removeCharacter: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter((c) => c.id !== action.payload);
      if (state.current?.id === action.payload) state.current = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadCharacters.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(loadCharacters.fulfilled, (state, action) => {
        state.status = 'loaded';
        state.items = action.payload;
      })
      .addCase(loadCharacters.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка завантаження';
      })
      .addCase(loadCharacter.fulfilled, (state, action) => {
        state.current = action.payload;
        upsertItem(state, action.payload);
      })
      .addCase(createCharacterThunk.fulfilled, (state, action) => {
        state.items.push(action.payload);
        state.current = action.payload;
      })
      .addCase(updateCharacterThunk.fulfilled, (state, action) => {
        upsertItem(state, action.payload);
        if (state.current?.id === action.payload.id) state.current = action.payload;
      })
      .addCase(uploadPdfThunk.fulfilled, (state, action) => {
        upsertItem(state, action.payload);
        if (state.current?.id === action.payload.id) state.current = action.payload;
      });
  },
});

function upsertItem(state: CharactersState, item: CharacterSheetDTO): void {
  const idx = state.items.findIndex((c) => c.id === item.id);
  if (idx === -1) state.items.push(item);
  else state.items[idx] = item;
}

export const { clearCharacters, setCurrentCharacter, upsertCharacter, removeCharacter } = charactersSlice.actions;
export default charactersSlice.reducer;
