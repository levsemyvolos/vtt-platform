import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { InitiativeEntryDTO, InitiativeUpdatedPayload } from '@vtt/shared';
import {
  addInitiative,
  advanceInitiative,
  removeInitiative,
  reorderInitiative,
} from '../api/initiative';

interface InitiativeState {
  entries: InitiativeEntryDTO[];
  currentRound: number;
}

const initialState: InitiativeState = {
  entries: [],
  currentRound: 0,
};

/**
 * Універсальний хидрат: приймає `InitiativeUpdatedPayload`
 * або сирий масив `InitiativeEntryDTO[]` (для зворотної сумісності
 * з ранніми викликами resync, де currentRound зберігається в SessionResyncPayload).
 */
type HydratePayload = InitiativeEntryDTO[] | InitiativeUpdatedPayload;

export const addEntryThunk = createAsyncThunk<
  InitiativeUpdatedPayload,
  { sceneId: string; name: string; initiative: number },
  { rejectValue: string }
>('initiative/add', async ({ sceneId, name, initiative }, { rejectWithValue }) => {
  try {
    return await addInitiative(sceneId, { name, initiative });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося додати позицію');
  }
});

export const removeEntryThunk = createAsyncThunk<
  InitiativeUpdatedPayload,
  { sceneId: string; entryId: string },
  { rejectValue: string }
>('initiative/remove', async ({ sceneId, entryId }, { rejectWithValue }) => {
  try {
    return await removeInitiative(sceneId, entryId);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося видалити позицію');
  }
});

export const reorderThunk = createAsyncThunk<
  InitiativeUpdatedPayload,
  { sceneId: string; orderedIds: string[] },
  { rejectValue: string }
>('initiative/reorder', async ({ sceneId, orderedIds }, { rejectWithValue }) => {
  try {
    return await reorderInitiative(sceneId, orderedIds);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося змінити порядок');
  }
});

export const advanceTurnThunk = createAsyncThunk<
  InitiativeUpdatedPayload,
  { sceneId: string },
  { rejectValue: string }
>('initiative/advance', async ({ sceneId }, { rejectWithValue }) => {
  try {
    return await advanceInitiative(sceneId);
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Не вдалося завершити хід');
  }
});

const initiativeSlice = createSlice({
  name: 'initiative',
  initialState,
  reducers: {
    hydrateInitiative: (state, action: PayloadAction<HydratePayload>) => {
      const payload = action.payload;
      if (Array.isArray(payload)) {
        state.entries = payload;
      } else {
        state.entries = payload.entries;
        state.currentRound = payload.currentRound;
      }
    },
    clearInitiative: (state) => {
      state.entries = [];
      state.currentRound = 0;
    },
    updateFromWss: (state, action: PayloadAction<InitiativeUpdatedPayload>) => {
      state.entries = action.payload.entries;
      state.currentRound = action.payload.currentRound;
    },
  },
  extraReducers: (builder) => {
    const apply = (
      state: InitiativeState,
      action: PayloadAction<InitiativeUpdatedPayload>,
    ): void => {
      state.entries = action.payload.entries;
      state.currentRound = action.payload.currentRound;
    };
    builder
      .addCase(addEntryThunk.fulfilled, apply)
      .addCase(removeEntryThunk.fulfilled, apply)
      .addCase(reorderThunk.fulfilled, apply)
      .addCase(advanceTurnThunk.fulfilled, apply);
  },
});

export const { hydrateInitiative, clearInitiative, updateFromWss } = initiativeSlice.actions;
export default initiativeSlice.reducer;
