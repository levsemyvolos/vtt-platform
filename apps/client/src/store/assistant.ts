import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { AssistantContext, ConversationMessage, AssistantMessageDTO, AssistantHistoryResponse } from '@vtt/shared';
import { postAssistantText } from '../api/ai';
import { apiFetch, ApiError } from '../api/apiFetch';

interface AssistantState {
  conversations: Record<string, ConversationMessage[]>;
  activeContext: AssistantContext;
  status: 'idle' | 'sending' | 'error';
  error: string | null;
  /** Whether history has been loaded from DB for the current room. */
  historyLoaded: Record<string, boolean>;
}

const initialState: AssistantState = {
  conversations: {},
  activeContext: 'npc-description',
  status: 'idle',
  error: null,
  historyLoaded: {},
};

const MAX_HISTORY = 10;

/**
 * Loads persisted AI chat history for a room from the server.
 * Called on Lobby/GameRoom mount — makes chat F5-safe.
 */
export const fetchAssistantHistory = createAsyncThunk<
  { roomId: string; messages: AssistantMessageDTO[] },
  { roomId: string },
  { rejectValue: string; state: { assistant: AssistantState } }
>(
  'assistant/fetchHistory',
  async ({ roomId }, { getState, rejectWithValue }) => {
    // Avoid duplicate fetches in same session
    if (getState().assistant.historyLoaded[roomId]) {
      return { roomId, messages: [] };
    }
    try {
      const data = await apiFetch<AssistantHistoryResponse>(`/api/ai/messages?roomId=${roomId}`);
      return { roomId, messages: data.messages };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // Observer or unauthenticated — not an error, just no history
        return { roomId, messages: [] };
      }
      return rejectWithValue('errors:ai.historyFailed');
    }
  },
);

export const sendAssistantMessage = createAsyncThunk<
  { conversationId: string; userMsg: ConversationMessage; assistantMsg: ConversationMessage },
  { roomId: string; context: AssistantContext; prompt: string; conversationId: string },
  { rejectValue: string; state: { assistant: AssistantState } }
>(
  'assistant/send',
  async ({ roomId, context, prompt, conversationId }, { getState, rejectWithValue }) => {
    const history = getState().assistant.conversations[conversationId] ?? [];
    try {
      const response = await postAssistantText({
        roomId,
        context,
        userPrompt: prompt,
        conversationHistory: history.slice(-MAX_HISTORY),
      });
      const userMsg: ConversationMessage = { role: 'user', content: prompt };
      const assistantMsg: ConversationMessage = { role: 'assistant', content: response.content };

      // Persist both messages to DB (fire-and-forget — don't block UI)
      await apiFetch('/api/ai/messages', {
        method: 'POST',
        body: JSON.stringify({ roomId, role: 'user', content: prompt }),
      });
      await apiFetch('/api/ai/messages', {
        method: 'POST',
        body: JSON.stringify({ roomId, role: 'assistant', content: response.content }),
      });

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
      .addCase(fetchAssistantHistory.fulfilled, (state, action) => {
        const { roomId, messages } = action.payload;
        state.historyLoaded[roomId] = true;
        // Group messages by context prefix — messages have no context; put them under 'free-chat'
        if (messages.length > 0) {
          const conversationId = `${roomId}:free-chat`;
          const existing = state.conversations[conversationId] ?? [];
          if (existing.length === 0) {
            state.conversations[conversationId] = messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }));
          }
        }
      })
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
