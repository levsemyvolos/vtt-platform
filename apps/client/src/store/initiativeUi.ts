import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface InitiativeUiState {
  pendingAdd: { tokenId: string; name: string } | null;
  hoveredEntryId: string | null;
}

const initialState: InitiativeUiState = {
  pendingAdd: null,
  hoveredEntryId: null,
};

const initiativeUiSlice = createSlice({
  name: 'initiativeUi',
  initialState,
  reducers: {
    requestAddFromToken(state, action: PayloadAction<{ tokenId: string; name: string }>) {
      state.pendingAdd = action.payload;
    },
    clearPendingAdd(state) {
      state.pendingAdd = null;
    },
    setHoveredEntry(state, action: PayloadAction<string | null>) {
      state.hoveredEntryId = action.payload;
    },
  },
});

export const {
  requestAddFromToken,
  clearPendingAdd,
  setHoveredEntry,
} = initiativeUiSlice.actions;
export default initiativeUiSlice.reducer;
