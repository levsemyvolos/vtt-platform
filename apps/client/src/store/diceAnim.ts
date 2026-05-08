import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface DiceAnimItem {
  expression: string;
  rolls: number[];
}

interface DiceAnimState {
  /** FIFO of anim items to play. Producer enqueues; DiceOverlay consumes head. */
  queue: DiceAnimItem[];
}

const initialState: DiceAnimState = { queue: [] };

const slice = createSlice({
  name: 'diceAnim',
  initialState,
  reducers: {
    enqueueDiceAnim(state, action: PayloadAction<DiceAnimItem>) {
      state.queue.push(action.payload);
    },
    consumeDiceAnimQueue(state) {
      state.queue.shift();
    },
  },
});

export const { enqueueDiceAnim, consumeDiceAnimQueue } = slice.actions;
export default slice.reducer;
