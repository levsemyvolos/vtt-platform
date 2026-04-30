import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { UserPublic, AuthTokenPair, ObserverJoinResponse } from '@vtt/shared';
import { apiFetch } from '../api/apiFetch';
import { tokenStore } from '../api/tokenStore';

interface SessionState {
  currentUser: UserPublic | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error';
  error: string | null;
}

const initialState: SessionState = {
  currentUser: null,
  accessToken: null,
  status: 'idle',
  error: null,
};

export const login = createAsyncThunk<
  AuthTokenPair,
  { email: string; password: string },
  { rejectValue: string }
>('session/login', async (credentials, { rejectWithValue }) => {
  try {
    return await apiFetch<AuthTokenPair>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка входу');
  }
});

export const register = createAsyncThunk<
  AuthTokenPair,
  { email: string; password: string; name: string },
  { rejectValue: string }
>('session/register', async (payload, { rejectWithValue }) => {
  try {
    return await apiFetch<AuthTokenPair>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Помилка реєстрації');
  }
});

export const observerJoin = createAsyncThunk<
  ObserverJoinResponse,
  { inviteCode: string; name: string },
  { rejectValue: string }
>('session/observerJoin', async (payload, { rejectWithValue }) => {
  try {
    return await apiFetch<ObserverJoinResponse>('/api/rooms/join-invite', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return rejectWithValue(err instanceof Error ? err.message : 'Недійсний код запрошення');
  }
});

export const logout = createAsyncThunk('session/logout', async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } finally {
    tokenStore.clear();
  }
});

function applyTokenPair(state: SessionState, payload: AuthTokenPair): void {
  state.status = 'authenticated';
  state.currentUser = payload.user;
  state.accessToken = payload.accessToken;
  tokenStore.setAccess(payload.accessToken);
  tokenStore.setRefresh(payload.refreshToken);
}

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    setTokens: (state, action: PayloadAction<AuthTokenPair>) => {
      applyTokenPair(state, action.payload);
    },
    clearSession: (state) => {
      state.currentUser = null;
      state.accessToken = null;
      state.status = 'idle';
      state.error = null;
      tokenStore.clear();
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        applyTokenPair(state, action.payload);
      })
      .addCase(login.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка входу';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        applyTokenPair(state, action.payload);
      })
      .addCase(register.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка реєстрації';
      })
      .addCase(observerJoin.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(observerJoin.fulfilled, (state, action) => {
        applyTokenPair(state, action.payload);
      })
      .addCase(observerJoin.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.payload ?? 'Помилка входу';
      })
      .addCase(logout.fulfilled, (state) => {
        state.currentUser = null;
        state.accessToken = null;
        state.status = 'idle';
        state.error = null;
      });
  },
});

export const { setTokens, clearSession, clearError } = sessionSlice.actions;
export default sessionSlice.reducer;
