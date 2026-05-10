import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  message: string;
  count?: number;
}

interface ToastState {
  queue: ToastItem[];
}

const initialState: ToastState = { queue: [] };

const TOAST_MAX = 5;

let nextId = 1;

const toastSlice = createSlice({
  name: 'toast',
  initialState,
  reducers: {
    addToast: {
      reducer(state, action: PayloadAction<ToastItem>) {
        // C3: deduplicate consecutive identical toasts
        const last = state.queue[state.queue.length - 1];
        if (last && last.variant === action.payload.variant && last.message === action.payload.message) {
          last.count = (last.count ?? 1) + 1;
          return;
        }
        // B5-MIN-002: limit simultaneous toasts to TOAST_MAX
        if (state.queue.length >= TOAST_MAX) {
          state.queue.shift();
        }
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
