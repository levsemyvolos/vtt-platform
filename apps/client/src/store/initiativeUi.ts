import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface InitiativeUiState {
  pendingAdd: { tokenId: string; name: string } | null;
}

const initialState: InitiativeUiState = { pendingAdd: null };

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
  },
});

export const { requestAddFromToken, clearPendingAdd } = initiativeUiSlice.actions;
export default initiativeUiSlice.reducer;
