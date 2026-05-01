import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { AssistantContext, ConversationMessage } from '@vtt/shared';
import { postAssistantText } from '../api/ai';
import { ApiError } from '../api/apiFetch';

interface AssistantState {
  conversations: Record<string, ConversationMessage[]>;
  activeContext: AssistantContext;
  status: 'idle' | 'sending' | 'error';
  error: string | null;
}

const initialState: AssistantState = {
  conversations: {},
  activeContext: 'npc-description',
  status: 'idle',
  error: null,
};

const MAX_HISTORY = 10;

export const sendAssistantMessage = createAsyncThunk<
  { conversationId: string; userMsg: ConversationMessage; assistantMsg: ConversationMessage },
  { context: AssistantContext; prompt: string; conversationId: string },
  { rejectValue: string; state: { assistant: AssistantState } }
>(
  'assistant/send',
  async ({ context, prompt, conversationId }, { getState, rejectWithValue }) => {
    const history = getState().assistant.conversations[conversationId] ?? [];
    try {
      const response = await postAssistantText({
        context,
        userPrompt: prompt,
        conversationHistory: history.slice(-MAX_HISTORY),
      });
      const userMsg: ConversationMessage = { role: 'user', content: prompt };
      const assistantMsg: ConversationMessage = { role: 'assistant', content: response.content };
      return { conversationId, userMsg, assistantMsg };
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) return rejectWithValue('errors:rateLimit.aiText');
        if (err.status >= 500) return rejectWithValue('errors:server.aiUnavailable');
      }
      return rejectWithValue('errors:ai.generic');
    }
  },
);

const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    setActiveContext: (state, action: PayloadAction<AssistantContext>) => {
      state.activeContext = action.payload;
    },
    clearConversation: (state, action: PayloadAction<string>) => {
      delete state.conversations[action.payload];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(sendAssistantMessage.pending, (state) => {
        state.status = 'sending';
        state.error = null;
      })
      .addCase(sendAssistantMessage.fulfilled, (state, action) => {
        state.status = 'idle';
        const { conversationId, userMsg, assistantMsg } = action.payload;
        const conv = state.conversations[conversationId] ?? [];
        state.conversations[conversationId] = [...conv, userMsg, assistantMsg];
      })
      .addCase(sendAssistantMessage.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'errors:ai.generic';
      });
  },
});

export const { setActiveContext, clearConversation } = assistantSlice.actions;
export default assistantSlice.reducer;
