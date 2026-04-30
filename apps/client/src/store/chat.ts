import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessageDTO, ChatDicePayload } from '@vtt/shared';

interface ChatState {
  messages: ChatMessageDTO[];
  /** Capacity bound — older messages are dropped on overflow (UI safety). */
  capacity: number;
}

const initialState: ChatState = {
  messages: [],
  capacity: 500,
};

const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    hydrateChat: (state, action: PayloadAction<ChatMessageDTO[]>) => {
      state.messages = action.payload.slice(-state.capacity);
    },
    appendChatMessage: (state, action: PayloadAction<ChatMessageDTO>) => {
      state.messages.push(action.payload);
      if (state.messages.length > state.capacity) state.messages.shift();
    },
    /**
     * Renders a dice roll as a synthetic ChatMessageDTO so chat panel can
     * display it inline alongside text messages (sequence Process_View_DiceRoll).
     */
    appendDiceRoll: (state, action: PayloadAction<ChatDicePayload>) => {
      const p = action.payload;
      state.messages.push({
        id: p.messageId,
        roomId: p.roomId,
        userId: p.userId,
        mode: p.secret ? 'secret_roll' : 'normal',
        text: p.expression,
        rollPayload: {
          expression: p.expression,
          total: p.total,
          rolls: p.rolls,
          mode: p.mode,
        },
        createdAt: p.createdAt,
      });
      if (state.messages.length > state.capacity) state.messages.shift();
    },
    clearChat: (state) => {
      state.messages = [];
    },
  },
});

export const { hydrateChat, appendChatMessage, appendDiceRoll, clearChat } = chatSlice.actions;
export default chatSlice.reducer;
