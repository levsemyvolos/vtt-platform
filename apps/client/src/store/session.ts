import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import i18next from 'i18next';
import type { UserPublic, AuthTokenPair, ObserverJoinResponse } from '@vtt/shared';
import { apiFetch } from '../api/apiFetch';
import { tokenStore } from '../api/tokenStore';
import { addToast } from './toast';

/**
 * Wave 6.2 — error source discrimination.
 *
 * - 'bootstrap'  : network/5xx during bootstrapSession → show BootstrapLoader with retry.
 * - 'authForm'   : login/register/observerJoin rejected (4xx) → show inline error in form.
 * - 'transient'  : one-off soft errors (e.g. refresh 5xx while authenticated) → toast only.
 * - null         : no error, or error already cleared.
 */
export type ErrorSource = 'bootstrap' | 'authForm' | 'transient' | null;

interface SessionState {
  currentUser: UserPublic | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'error' | 'bootstrapping';
  error: string | null;
  /** Discriminates the error origin so consumers can react appropriately (Wave 6.2). */
  errorSource: ErrorSource;
  /** Invite code pre-filled when the user lands on /?invite=TOKEN while unauthenticated (Wave 2.2). */
  prefilledInviteCode: string | null;
}

const initialState: SessionState = {
  currentUser: null,
  accessToken: null,
  status: tokenStore.getRefresh() ? 'bootstrapping' : 'idle',
  error: null,
  errorSource: null,
  prefilledInviteCode: null,
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
>('session/register', async (payload, { rejectWithValue, dispatch }) => {
  try {
    const result = await apiFetch<AuthTokenPair>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    // Welcome toast — uses i18next directly since we're outside React context.
    const name = result.user?.name ?? payload.name;
    const msg = i18next.t('auth:register.welcome', { name, defaultValue: `Welcome, ${name}!` });
    dispatch(addToast('success', msg));
    return result;
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

/**
 * Restore session from a persisted refresh token after a page reload.
 *
 * Wave 3.1 — differentiates error types to avoid spurious logouts:
 *   - AbortError (F5 double-press interrupts the in-flight request) →
 *     return a special sentinel so the reducer retries instead of going idle.
 *   - HTTP 401 → token is invalid/expired → clear and go idle (real logout).
 *   - Network / 5xx → server unreachable → keep token, set 'error' status.
 *
 * Wave 6.5 (BUG-007) — F5 race hardening:
 *   - Real browser F5 navigation does NOT trigger AbortController in React code.
 *     The browser cancels the in-flight fetch, producing TypeError: Failed to fetch
 *     (not a DOMException / AbortError). This was already handled as NETWORK_ERROR,
 *     which keeps the token and shows BootstrapLoader (correct behavior).
 *   - However, on first NETWORK_ERROR we now schedule a silent retry after a short
 *     delay so a transient cold-start 5xx on dev server does NOT require manual
 *     "Try again" click. Only after MAX_BOOTSTRAP_RETRIES failures do we surface the
 *     BootstrapLoader error UI.
 *   - ApiError(0) from apiFetch timeout is treated the same as a network error.
 */

/** Number of automatic retries before surfacing the BootstrapLoader error UI. */
const MAX_BOOTSTRAP_RETRIES = 3;
/** Delay between automatic retries (ms). */
const BOOTSTRAP_RETRY_DELAY_MS = 1500;

export const bootstrapSession = createAsyncThunk<
  AuthTokenPair | null | 'ABORTED' | 'NETWORK_ERROR',
  void,
  { rejectValue: 'ABORTED' | 'NETWORK_ERROR' }
>(
  'session/bootstrap',
  // eslint-disable-next-line complexity
  async (_, { rejectWithValue }) => {
    const refreshToken = tokenStore.getRefresh();
    if (!refreshToken) return null;

    // BUG-007: retry loop — absorb transient network errors (e.g. dev server cold start,
    // browser cancelling in-flight fetch during F5) before surfacing an error to the UI.
    for (let attempt = 0; attempt < MAX_BOOTSTRAP_RETRIES; attempt++) {
      try {
        const pair = await apiFetch<AuthTokenPair>('/api/auth/refresh', {
          method: 'POST',
          body: JSON.stringify({ refreshToken }),
        });
        return pair;
      } catch (err) {
        // AbortError: the fetch was cancelled mid-flight (e.g. rapid F5 with AbortController).
        // Do NOT clear the token — retry will succeed.
        if (err instanceof DOMException && err.name === 'AbortError') {
          return rejectWithValue('ABORTED');
        }
        // ApiError with 401 — token rejected by server. Clear and go idle.
        if (err instanceof Error && 'status' in err && (err as { status: number }).status === 401) {
          tokenStore.clear();
          return null;
        }
        // Network failure (TypeError: Failed to fetch) or 5xx (ApiError) or timeout (ApiError(0)).
        // On the last attempt → signal NETWORK_ERROR for BootstrapLoader retry UI.
        if (attempt < MAX_BOOTSTRAP_RETRIES - 1) {
          // Brief delay before retry — absorbs dev server cold start or F5 connection drop.
          await new Promise<void>((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
          continue;
        }
        return rejectWithValue('NETWORK_ERROR');
      }
    }
    // Unreachable — TypeScript requires exhaustive return.
    return rejectWithValue('NETWORK_ERROR');
  },
);

export const logout = createAsyncThunk('session/logout', async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    // R2-BUG-006: even if server returns 503 or network fails, swallow the error
    // so the thunk always resolves as fulfilled. The reducer then clears the state.
    // Server-side lenient logout (Wave 6.5.3) should prevent 503, but this is a safety net.
    // eslint-disable-next-line no-console
    console.warn('[logout] server-side logout failed, clearing local session anyway', e);
  } finally {
    tokenStore.clear();
  }
  // Always return void — thunk always resolves fulfilled, never rejects.
  // logout.fulfilled reducer handles state cleanup.
});

function applyTokenPair(state: SessionState, payload: AuthTokenPair): void {
  state.status = 'authenticated';
  state.currentUser = payload.user;
  state.accessToken = payload.accessToken;
  state.error = null;
  state.errorSource = null;
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
      state.errorSource = null;
      state.prefilledInviteCode = null;
      tokenStore.clear();
    },
    clearError: (state) => {
      state.error = null;
      state.errorSource = null;
    },
    /** Wave 2.2 — store invite code from URL for ObserverEntry pre-fill. */
    setPrefilledInviteCode: (state, action: PayloadAction<string | null>) => {
      state.prefilledInviteCode = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.errorSource = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        applyTokenPair(state, action.payload);
      })
      // Wave 6.2: login rejected → stay 'idle' so AuthViews stay visible; errorSource='authForm'
      // so that Login.tsx inline error renders and BootstrapLoader does NOT trigger.
      .addCase(login.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload ?? 'Помилка входу';
        state.errorSource = 'authForm';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.errorSource = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        applyTokenPair(state, action.payload);
      })
      // Wave 6.2: register rejected → 'idle' + errorSource='authForm'.
      .addCase(register.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload ?? 'Помилка реєстрації';
        state.errorSource = 'authForm';
      })
      .addCase(observerJoin.pending, (state) => {
        state.status = 'loading';
        state.error = null;
        state.errorSource = null;
      })
      .addCase(observerJoin.fulfilled, (state, action) => {
        applyTokenPair(state, action.payload);
      })
      // Wave 6.2: observerJoin rejected → 'idle' + errorSource='authForm'.
      .addCase(observerJoin.rejected, (state, action) => {
        state.status = 'idle';
        state.error = action.payload ?? 'Помилка входу';
        state.errorSource = 'authForm';
      })
      .addCase(logout.fulfilled, (state) => {
        state.currentUser = null;
        state.accessToken = null;
        state.status = 'idle';
        state.error = null;
        state.errorSource = null;
      })
      .addCase(bootstrapSession.pending, (state) => {
        if (state.status !== 'authenticated') state.status = 'bootstrapping';
        state.error = null;
        state.errorSource = null;
      })
      .addCase(bootstrapSession.fulfilled, (state, action) => {
        if (action.payload) {
          applyTokenPair(state, action.payload as AuthTokenPair);
        } else {
          state.status = 'idle';
          state.errorSource = null;
        }
      })
      // Wave 3.1 — distinguish abort vs network error vs 401.
      // Wave 6.2 — only bootstrap errors set errorSource='bootstrap', so App.tsx
      //            shows BootstrapLoader only for this case (not for authForm errors).
      .addCase(bootstrapSession.rejected, (state, action) => {
        if (action.payload === 'ABORTED') {
          // F5 mid-flight — keep bootstrapping so App re-fires the thunk.
          state.status = 'bootstrapping';
        } else if (action.payload === 'NETWORK_ERROR') {
          // Server unreachable — do NOT log out; let BootstrapLoader show retry.
          state.status = 'error';
          state.error = 'errors:network.loadFailed';
          state.errorSource = 'bootstrap';
        } else {
          state.status = 'idle';
          state.error = null;
          state.errorSource = null;
        }
      });
  },
});

export const { setTokens, clearSession, clearError, setPrefilledInviteCode } = sessionSlice.actions;
export default sessionSlice.reducer;

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/**
 * True when the authenticated user is an anonymous Observer.
 * Observers are identified by the presence of boundRoomId in their UserPublic
 * (set by POST /rooms/join-invite and preserved across token refresh).
 */
export const selectIsObserver = (state: { session: SessionState }): boolean =>
  state.session.currentUser?.boundRoomId !== undefined;

/** Returns the boundRoomId from the Observer's UserPublic, or undefined. */
export const selectObserverBoundRoomId = (state: { session: SessionState }): string | undefined =>
  state.session.currentUser?.boundRoomId;
