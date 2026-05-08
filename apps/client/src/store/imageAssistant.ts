import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  AssistantImageConversationDTO,
  AssistantImageTurnDTO,
  CreateImageConversationRequest,
  ContinueImageConversationResponse,
} from '@vtt/shared';
import {
  listImageConversations,
  createImageConversation,
  renameImageConversation,
  deleteImageConversation,
  listImageTurns,
  continueImageConversation,
} from '../api/ai';
import { ApiError } from '../api/apiFetch';
import { mapAIErrorKindToI18n } from './assistant';

interface ImageAssistantState {
  /** Conversation metadata, keyed by id. */
  conversations: Record<string, AssistantImageConversationDTO>;
  /** Turns per conversation. */
  turns: Record<string, AssistantImageTurnDTO[]>;
  /** Active conversation id. */
  activeConversationId: string | null;
  status: 'idle' | 'loading' | 'generating' | 'error';
  error: string | null;
  /** Conversation that currently has a generation in flight; null if idle.
   *  Used to scope the pending-card to the right thread instead of every thread. */
  generatingConversationId: string | null;
  /** Per-room flag — has the conversation list been fetched? */
  conversationsLoaded: Record<string, boolean>;
  /** Per-conversation flag — have turns been fetched? */
  turnsLoaded: Record<string, boolean>;
}

const initialState: ImageAssistantState = {
  conversations: {},
  turns: {},
  activeConversationId: null,
  status: 'idle',
  error: null,
  generatingConversationId: null,
  conversationsLoaded: {},
  turnsLoaded: {},
};

// ─── Thunks ────────────────────────────────────────────────────────────────

export const fetchImageConversations = createAsyncThunk<
  { roomId: string; conversations: AssistantImageConversationDTO[] },
  { roomId: string },
  { rejectValue: string; state: { imageAssistant: ImageAssistantState } }
>(
  'imageAssistant/fetchConversations',
  async ({ roomId }, { getState, rejectWithValue }) => {
    if (getState().imageAssistant.conversationsLoaded[roomId]) {
      return { roomId, conversations: [] };
    }
    try {
      const conversations = await listImageConversations(roomId);
      return { roomId, conversations };
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        return { roomId, conversations: [] };
      }
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const createImageConv = createAsyncThunk<
  AssistantImageConversationDTO,
  CreateImageConversationRequest,
  { rejectValue: string }
>(
  'imageAssistant/create',
  async (req, { rejectWithValue }) => {
    try {
      return await createImageConversation(req);
    } catch (err) {
      if (err instanceof ApiError) return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const renameImageConv = createAsyncThunk<
  AssistantImageConversationDTO,
  { id: string; title: string },
  { rejectValue: string }
>(
  'imageAssistant/rename',
  async ({ id, title }, { rejectWithValue }) => {
    try {
      return await renameImageConversation(id, { title });
    } catch (err) {
      if (err instanceof ApiError) return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const deleteImageConv = createAsyncThunk<
  { id: string },
  { id: string },
  { rejectValue: string }
>(
  'imageAssistant/delete',
  async ({ id }, { rejectWithValue }) => {
    try {
      await deleteImageConversation(id);
      return { id };
    } catch (err) {
      if (err instanceof ApiError) return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const fetchImageTurns = createAsyncThunk<
  { conversationId: string; turns: AssistantImageTurnDTO[] },
  { conversationId: string },
  { rejectValue: string; state: { imageAssistant: ImageAssistantState } }
>(
  'imageAssistant/fetchTurns',
  async ({ conversationId }, { getState, rejectWithValue }) => {
    if (getState().imageAssistant.turnsLoaded[conversationId]) {
      return { conversationId, turns: [] };
    }
    try {
      const turns = await listImageTurns(conversationId);
      return { conversationId, turns };
    } catch (err) {
      if (err instanceof ApiError) return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

export const continueImageConv = createAsyncThunk<
  { conversationId: string; turn: AssistantImageTurnDTO },
  { conversationId: string; prompt: string; referenceAssetIds: string[] },
  { rejectValue: string }
>(
  'imageAssistant/continue',
  async ({ conversationId, prompt, referenceAssetIds }, { rejectWithValue }) => {
    try {
      const result: ContinueImageConversationResponse = await continueImageConversation(conversationId, {
        prompt,
        referenceAssetIds,
      });
      const turn: AssistantImageTurnDTO = {
        id: result.turnId,
        conversationId,
        turnIndex: result.turnIndex,
        userPrompt: prompt,
        generatedAssetId: result.generatedAssetId,
        generatedAssetUrl: result.generatedAssetUrl,
        referenceAssetIds: [...referenceAssetIds],
        // Server didn't return signed URLs for the references in the continue
        // response; if the page reloads we'll get them via fetchImageTurns.
        // For the optimistic in-flight render, we rely on the local AssetDTO
        // cache passed in via the prompt-bar — the UI already has those URLs.
        referenceAssetUrls: [],
        createdAt: new Date().toISOString(),
      };
      return { conversationId, turn };
    } catch (err) {
      if (err instanceof ApiError) return rejectWithValue(mapAIErrorKindToI18n(err.kind, err.status));
      return rejectWithValue('errors:ai.unknown');
    }
  },
);

// ─── Slice ─────────────────────────────────────────────────────────────────

const slice = createSlice({
  name: 'imageAssistant',
  initialState,
  reducers: {
    setActiveImageConversationId: (state, action: PayloadAction<string | null>) => {
      state.activeConversationId = action.payload;
    },
    clearImageError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchImageConversations.fulfilled, (state, action) => {
        const { roomId, conversations } = action.payload;
        state.conversationsLoaded[roomId] = true;
        for (const c of conversations) state.conversations[c.id] = c;
      })
      .addCase(createImageConv.fulfilled, (state, action) => {
        const dto = action.payload;
        state.conversations[dto.id] = dto;
        state.activeConversationId = dto.id;
      })
      .addCase(createImageConv.rejected, (state, action) => {
        state.error = action.payload ?? 'errors:ai.unknown';
      })
      .addCase(renameImageConv.fulfilled, (state, action) => {
        state.conversations[action.payload.id] = action.payload;
      })
      .addCase(deleteImageConv.fulfilled, (state, action) => {
        const { id } = action.payload;
        delete state.conversations[id];
        delete state.turns[id];
        delete state.turnsLoaded[id];
        if (state.activeConversationId === id) state.activeConversationId = null;
      })
      .addCase(fetchImageTurns.fulfilled, (state, action) => {
        const { conversationId, turns } = action.payload;
        state.turnsLoaded[conversationId] = true;
        if (turns.length > 0) state.turns[conversationId] = turns;
      })
      .addCase(continueImageConv.pending, (state, action) => {
        state.status = 'generating';
        state.error = null;
        state.generatingConversationId = action.meta.arg.conversationId;
      })
      .addCase(continueImageConv.fulfilled, (state, action) => {
        state.status = 'idle';
        state.generatingConversationId = null;
        const { conversationId, turn } = action.payload;
        const list = state.turns[conversationId] ?? [];
        state.turns[conversationId] = [...list, turn];
        // Bump conv updatedAt
        const meta = state.conversations[conversationId];
        if (meta) state.conversations[conversationId] = { ...meta, updatedAt: new Date().toISOString() };
      })
      .addCase(continueImageConv.rejected, (state, action) => {
        state.status = 'error';
        state.generatingConversationId = null;
        state.error = action.payload ?? 'errors:ai.unknown';
      });
  },
});

export const { setActiveImageConversationId, clearImageError } = slice.actions;
export default slice.reducer;
