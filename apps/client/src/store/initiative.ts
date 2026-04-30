import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { InitiativeEntryDTO } from '@vtt/shared';

interface InitiativeState {
  entries: InitiativeEntryDTO[];
}

const initialState: InitiativeState = {
  entries: [],
};

const initiativeSlice = createSlice({
  name: 'initiative',
  initialState,
  reducers: {
    hydrateInitiative: (state, action: PayloadAction<InitiativeEntryDTO[]>) => {
      state.entries = action.payload;
    },
    clearInitiative: (state) => {
      state.entries = [];
    },
  },
});

export const { hydrateInitiative, clearInitiative } = initiativeSlice.actions;
export default initiativeSlice.reducer;
