import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit';
import type {
  AssistantContext,
  ConversationMessage,
  AssistantConversationDTO,
  CreateAssistantConversationRequest,
  ListAssistantConversationsResponse,
  AssistantHistoryResponse,
  AIErrorKind,
  AssistantStreamEvent,
} from '@vtt/shared';
import { streamAssistantText, streamRegenerate, streamEditAndResend } from '../api/ai';
import { apiFetch, ApiError } from '../api/apiFetch';

export function mapAIErrorKindToI18n(kind: string | undefined, status: number): string {
  switch (kind as AIErrorKind | undefined) {
    case 'ai_quota': return 'errors:ai.quota';
    case 'ai_safety': return 'errors:ai.safety';
    case 'ai_invalid_prompt': return 'errors:ai.invalidPrompt';
    case 'ai_network': return 'errors:ai.network';
    case 'ai_unknown': return 'errors:ai.unknown';
    default:
      if (status === 429) return 'errors:rateLimit.aiText';
      if (status >= 500) return 'errors:server.aiUnavailable';
      return 'errors:ai.unknown';
  }
}

interface AssistantState {
  /** Conversation metadata, keyed by conversation.id. */
  conversations: Record<string, AssistantConversationDTO>;
  /** Messages, keyed by conversation.id. */
  messages: Record<string, ConversationMessage[]>;
  /** Active conversation id, null if none picked yet. */
  activeConversationId: string | null;
  /** UI filter for DialogList — which context's threads to show. */
  activeContext: AssistantContext;
  status: 'idle' | 'sending' | 'error';
  error: string | null;
  /** Per-room flag — has the conversation list been fetched? */
  conversationsLoaded: Record<string, boolean>;
  /** Per-conversation flag — have messages been fetched? */
  messagesLoaded: Record<string, boolean>;
  rateLimitRemaining: number | null;
}

const initialState: AssistantState = {
  conversations: {},
  messages: {},
  activeConversationId: null,
  activeContext: 'npc-description',
  status: 'idle',
  error: null,
  conversationsLoaded: {},
  messagesLoaded: {},
  rateLimitRemaining: null,
};

const MAX_HISTORY = 10;
void MAX_HISTORY; // kept for reference; no longer used after regenerate rewrite

// ─── Thunks ────────────────────────────────────────────────────────────────

export const fetchConversations = createAsyncThunk<
  { roomId: string; conversations: AssistantConversationDTO[] },
  { roomId: string },
  { rejectValue: string; state: { assistant: AssistantState } }
>(
  'assistant/fetchConversations',
  async ({ roomId }, { getState, rejectWithValue }) => {
    if (getState().assistant.conversationsLoaded[roomId]) {
      return { roomId, conversations: [] };
    }
    try {
      const data = await apiFetch<ListAssistantConversationsResponse>(
        `/api/ai/conversations?roomId=${roomId}`,
      );
      return { roomId, conversations: data.conversations };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        // Observer / non-member — treat as empty.
        return { roomId, conversations: [] };
      }
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const createConversation = createAsyncThunk<
  AssistantConversationDTO,
  CreateAssistantConversationRequest,
  { rejectValue: string }
>(
  'assistant/createConversation',
  async (req, { rejectWithValue }) => {
    try {
      const dto = await apiFetch<AssistantConversationDTO>('/api/ai/conversations', {
        method: 'POST',
        body: JSON.stringify(req),
      });
      return dto;
    } catch (err) {
      if (err instanceof ApiError) {
        return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      }
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const renameConversation = createAsyncThunk<
  AssistantConversationDTO,
  { id: string; title: string },
  { rejectValue: string }
>(
  'assistant/renameConversation',
  async ({ id, title }, { rejectWithValue }) => {
    try {
      const dto = await apiFetch<AssistantConversationDTO>(`/api/ai/conversations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
      return dto;
    } catch (err) {
      if (err instanceof ApiError) {
        return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      }
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const deleteConversation = createAsyncThunk<
  { id: string },
  { id: string },
  { rejectValue: string }
>(
  'assistant/deleteConversation',
  async ({ id }, { rejectWithValue }) => {
    try {
      await apiFetch(`/api/ai/conversations/${id}`, { method: 'DELETE' });
      return { id };
    } catch (err) {
      if (err instanceof ApiError) {
        return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      }
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const fetchConversationMessages = createAsyncThunk<
  { conversationId: string; messages: ConversationMessage[] },
  { conversationId: string },
  { rejectValue: string; state: { assistant: AssistantState } }
>(
  'assistant/fetchConversationMessages',
  async ({ conversationId }, { getState, rejectWithValue }) => {
    if (getState().assistant.messagesLoaded[conversationId]) {
      return { conversationId, messages: [] };
    }
    try {
      const data = await apiFetch<AssistantHistoryResponse>(
        `/api/ai/conversations/${conversationId}/messages`,
      );
      const messages: ConversationMessage[] = data.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      return { conversationId, messages };
    } catch (err) {
      if (err instanceof ApiError) {
        return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      }
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

// ─── Slice ─────────────────────────────────────────────────────────────────

const assistantSlice = createSlice({
  name: 'assistant',
  initialState,
  reducers: {
    setActiveContext: (state, action: PayloadAction<AssistantContext>) => {
      state.activeContext = action.payload;
    },
    setActiveConversationId: (state, action: PayloadAction<string | null>) => {
      state.activeConversationId = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    streamStart: (state, action: PayloadAction<{ conversationId: string; userContent: string }>) => {
      const { conversationId, userContent } = action.payload;
      state.status = 'sending';
      state.error = null;
      const existing = state.messages[conversationId] ?? [];
      state.messages[conversationId] = [
        ...existing,
        { role: 'user', content: userContent },
        { role: 'assistant', content: '' },
      ];
    },
    streamChunk: (state, action: PayloadAction<{ conversationId: string; delta: string }>) => {
      const { conversationId, delta } = action.payload;
      const arr = state.messages[conversationId];
      if (!arr || arr.length === 0) return;
      const last = arr[arr.length - 1];
      if (last && last.role === 'assistant') {
        arr[arr.length - 1] = { role: 'assistant', content: last.content + delta };
      }
    },
    streamDone: (state, action: PayloadAction<{ conversationId: string; content: string; rateLimitRemaining: number | null }>) => {
      const { conversationId, content, rateLimitRemaining } = action.payload;
      const arr = state.messages[conversationId];
      if (arr && arr.length > 0) {
        const last = arr[arr.length - 1];
        if (last && last.role === 'assistant') {
          arr[arr.length - 1] = { role: 'assistant', content };
        }
      }
      state.status = 'idle';
      if (rateLimitRemaining !== null) {
        state.rateLimitRemaining = rateLimitRemaining;
      }
      // Bump local conversation updatedAt so DialogList re-sorts immediately.
      const meta = state.conversations[conversationId];
      if (meta) {
        state.conversations[conversationId] = { ...meta, updatedAt: new Date().toISOString() };
      }
    },
    streamError: (state, action: PayloadAction<{ conversationId: string; errorKey: string }>) => {
      const { conversationId, errorKey } = action.payload;
      // Drop the empty assistant placeholder if we never got chunks.
      const arr = state.messages[conversationId];
      if (arr && arr.length > 0) {
        const last = arr[arr.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          state.messages[conversationId] = arr.slice(0, -1);
        }
      }
      state.status = 'error';
      state.error = errorKey;
    },
    /** Optimistically removes the trailing assistant message of a conversation, used at the start of regenerate. */
    dropLastAssistant: (state, action: PayloadAction<{ conversationId: string }>) => {
      const arr = state.messages[action.payload.conversationId];
      if (!arr || arr.length === 0) return;
      const last = arr[arr.length - 1];
      if (last && last.role === 'assistant') {
        state.messages[action.payload.conversationId] = arr.slice(0, -1);
      }
    },
    /** Optimistically truncates messages after (and including) the last user message, re-adds edited user msg + empty assistant placeholder. */
    beginEditAndResend: (state, action: PayloadAction<{ conversationId: string; messageId: string; newContent: string }>) => {
      const { conversationId, messageId, newContent } = action.payload;
      const arr = state.messages[conversationId];
      if (!arr) return;
      // Without server message-ids in the local list (current state stores only role+content),
      // we use a positional fallback: the messageId is the LAST user message (the only editable
      // one in our UI). We replace it and drop everything after.
      let lastUserIdx = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]?.role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx === -1) return;
      void messageId; // backend uses the real id; client tracks position only.
      state.messages[conversationId] = [
        ...arr.slice(0, lastUserIdx),
        { role: 'user', content: newContent },
        { role: 'assistant', content: '' },
      ];
      state.status = 'sending';
      state.error = null;
    },
    /** Adds an empty assistant placeholder for regenerate flow. */
    addAssistantPlaceholder: (state, action: PayloadAction<{ conversationId: string }>) => {
      const arr = state.messages[action.payload.conversationId] ?? [];
      state.messages[action.payload.conversationId] = [...arr, { role: 'assistant', content: '' }];
      state.status = 'sending';
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConversations.fulfilled, (state, action) => {
        const { roomId, conversations } = action.payload;
        state.conversationsLoaded[roomId] = true;
        for (const c of conversations) {
          state.conversations[c.id] = c;
        }
      })
      .addCase(createConversation.fulfilled, (state, action) => {
        const dto = action.payload;
        state.conversations[dto.id] = dto;
        state.activeConversationId = dto.id;
      })
      .addCase(createConversation.rejected, (state, action) => {
        state.error = action.payload ?? 'errors:ai.unknown';
      })
      .addCase(renameConversation.fulfilled, (state, action) => {
        const dto = action.payload;
        state.conversations[dto.id] = dto;
      })
      .addCase(deleteConversation.fulfilled, (state, action) => {
        const { id } = action.payload;
        delete state.conversations[id];
        delete state.messages[id];
        delete state.messagesLoaded[id];
        if (state.activeConversationId === id) {
          state.activeConversationId = null;
        }
      })
      .addCase(fetchConversationMessages.fulfilled, (state, action) => {
        const { conversationId, messages } = action.payload;
        state.messagesLoaded[conversationId] = true;
        if (messages.length > 0) {
          state.messages[conversationId] = messages;
        }
      });
  },
});

export const {
  setActiveContext,
  setActiveConversationId,
  clearError,
  streamStart,
  streamChunk,
  streamDone,
  streamError,
  dropLastAssistant,
  beginEditAndResend,
  addAssistantPlaceholder,
} = assistantSlice.actions;

// ─── Streaming helpers ──────────────────────────────────────────────────────

const STREAM_FLUSH_MS = 50;

type Dispatch = (action: UnknownAction) => unknown;

function handleStreamEvent(
  ev: AssistantStreamEvent,
  state: { buffered: string; finalContent: string; errored: boolean },
  dispatch: Dispatch,
  conversationId: string,
  rateLimitRemaining: number | null,
  scheduleFlush: () => void,
  cancelFlush: () => void,
): 'continue' | 'done' | 'error' {
  if (ev.type === 'chunk') {
    state.buffered += ev.delta;
    state.finalContent += ev.delta;
    scheduleFlush();
    return 'continue';
  }
  if (ev.type === 'done') {
    cancelFlush();
    dispatch(streamDone({ conversationId, content: ev.content, rateLimitRemaining }) as UnknownAction);
    return 'done';
  }
  if (ev.type === 'error') {
    cancelFlush();
    dispatch(streamError({ conversationId, errorKey: mapAIErrorKindToI18n(ev.kind, 0) }) as UnknownAction);
    state.errored = true;
    return 'error';
  }
  return 'continue';
}

async function consumeStreamInto(
  dispatch: Dispatch,
  conversationId: string,
  open: (signal: AbortSignal) => Promise<{ events: AsyncIterable<AssistantStreamEvent>; rateLimitRemaining: number | null }>,
): Promise<void> {
  const controller = new AbortController();
  const mutableState = { buffered: '', finalContent: '', errored: false };
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    flushTimer = null;
    if (mutableState.buffered) {
      dispatch(streamChunk({ conversationId, delta: mutableState.buffered }) as UnknownAction);
      mutableState.buffered = '';
    }
  };
  const scheduleFlush = (): void => {
    if (flushTimer === null) flushTimer = setTimeout(flush, STREAM_FLUSH_MS);
  };
  const cancelFlush = (): void => {
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
  };

  try {
    const { events, rateLimitRemaining } = await open(controller.signal);
    for await (const ev of events) {
      const result = handleStreamEvent(ev, mutableState, dispatch, conversationId, rateLimitRemaining, scheduleFlush, cancelFlush);
      if (result === 'done' || result === 'error') return;
    }
    cancelFlush();
    if (!mutableState.errored) {
      dispatch(streamDone({ conversationId, content: mutableState.finalContent, rateLimitRemaining: null }) as UnknownAction);
    }
  } catch (err) {
    cancelFlush();
    if (err instanceof ApiError) {
      dispatch(streamError({ conversationId, errorKey: mapAIErrorKindToI18n(err.kind, err.status) }) as UnknownAction);
    } else {
      dispatch(streamError({ conversationId, errorKey: 'errors:ai.unknown' }) as UnknownAction);
    }
  }
}

// ─── Streaming thunks ───────────────────────────────────────────────────────

export function sendAssistantMessage(
  payload: { roomId: string; conversationId: string; context: AssistantContext; prompt: string; useSessionContext?: boolean; thinkingLevel?: 'low' | 'high' },
): ThunkAction<Promise<void>, { assistant: AssistantState }, unknown, UnknownAction> {
  return async (dispatch) => {
    const { roomId, conversationId, context, prompt, useSessionContext, thinkingLevel } = payload;
    dispatch(streamStart({ conversationId, userContent: prompt }));
    await consumeStreamInto(dispatch as Dispatch, conversationId, (signal) =>
      streamAssistantText(
        thinkingLevel === 'high'
          ? { roomId, conversationId, context, userPrompt: prompt, ...(useSessionContext !== undefined ? { useSessionContext } : {}), thinkingLevel: 'high' }
          : { roomId, conversationId, context, userPrompt: prompt, ...(useSessionContext !== undefined ? { useSessionContext } : {}) },
        signal,
      ),
    );
  };
}

export function regenerateAssistantMessage(
  payload: { roomId: string; conversationId: string; context: AssistantContext },
): ThunkAction<Promise<void>, { assistant: AssistantState }, unknown, UnknownAction> {
  return async (dispatch) => {
    void payload.roomId; void payload.context; // signature kept for callers; not needed for the new endpoint
    const { conversationId } = payload;
    dispatch(dropLastAssistant({ conversationId }));
    dispatch(addAssistantPlaceholder({ conversationId }));
    await consumeStreamInto(dispatch as Dispatch, conversationId, (signal) =>
      streamRegenerate(conversationId, signal),
    );
  };
}

export function editAssistantMessage(
  payload: { conversationId: string; messageId: string; newContent: string },
): ThunkAction<Promise<void>, { assistant: AssistantState }, unknown, UnknownAction> {
  return async (dispatch) => {
    const { conversationId, messageId, newContent } = payload;
    dispatch(beginEditAndResend({ conversationId, messageId, newContent }));
    await consumeStreamInto(dispatch as Dispatch, conversationId, (signal) =>
      streamEditAndResend(conversationId, messageId, newContent, signal),
    );
  };
}

/**
 * Convenience wrapper used by the UI: fetches the conversation's messages,
 * locates the last user-msg, then dispatches `editAssistantMessage` with its
 * server id. The UI doesn't have message ids in local state, so this
 * round-trip is unavoidable.
 */
export function editLastUserMessage(
  payload: { conversationId: string; newContent: string },
): ThunkAction<Promise<void>, { assistant: AssistantState }, unknown, UnknownAction> {
  return async (dispatch) => {
    const { conversationId, newContent } = payload;
    let lastUserMessageId: string | null = null;
    try {
      const data = await apiFetch<AssistantHistoryResponse>(`/api/ai/conversations/${conversationId}/messages`);
      for (let i = data.messages.length - 1; i >= 0; i--) {
        const m = data.messages[i];
        if (m && m.role === 'user') { lastUserMessageId = m.id; break; }
      }
    } catch (err) {
      if (err instanceof ApiError) {
        dispatch(streamError({ conversationId, errorKey: mapAIErrorKindToI18n(err.kind, err.status) }));
      } else {
        dispatch(streamError({ conversationId, errorKey: 'errors:ai.unknown' }));
      }
      return;
    }
    if (!lastUserMessageId) {
      dispatch(streamError({ conversationId, errorKey: 'errors:ai.unknown' }));
      return;
    }
    await dispatch(editAssistantMessage({ conversationId, messageId: lastUserMessageId, newContent }));
  };
}

export default assistantSlice.reducer;
