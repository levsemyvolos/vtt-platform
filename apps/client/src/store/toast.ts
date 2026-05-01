import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastState {
  queue: ToastItem[];
}

const initialState: ToastState = { queue: [] };

let nextId = 1;

const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    addToast: {
      reducer(state, action: PayloadAction<ToastItem>) {
        state.queue.push(action.payload);
      },
      prepare(variant: ToastVariant, message: string) {
        return { payload: { id: String(nextId++), variant, message } };
      },
    },
    removeToast(state, action: PayloadAction<string>) {
      state.queue = state.queue.filter((t) => t.id !== action.payload);
    },
  },
});

export const { addToast, removeToast } = toastSlice.actions;
export default toastSlice.reducer;
