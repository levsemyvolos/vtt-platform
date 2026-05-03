/**
 * Wave 6.2 — Regression tests for split error-source architecture.
 *
 * Verifies that:
 *  - login.rejected / register.rejected / observerJoin.rejected set errorSource='authForm'
 *    and keep status='idle' (NOT 'error'), so BootstrapLoader is NOT triggered.
 *  - bootstrapSession.rejected (NETWORK_ERROR) sets status='error' and errorSource='bootstrap',
 *    so BootstrapLoader IS triggered.
 *  - clearError resets both error and errorSource.
 */
import { describe, it, expect } from 'vitest';
import sessionReducer, {
  clearError,
  clearSession,
} from '../session';
import {
  login,
  register,
  observerJoin,
  bootstrapSession,
} from '../session';
import type { AuthTokenPair } from '@vtt/shared';

// Helper — build a minimal SessionState-shaped initial slice via the reducer
function init() {
  return sessionReducer(undefined, { type: '@@INIT' });
}

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------
describe('login thunk', () => {
  it('pending: status → loading, error/errorSource cleared', () => {
    const s = sessionReducer(init(), login.pending('', { email: '', password: '' }));
    expect(s.status).toBe('loading');
    expect(s.error).toBeNull();
    expect(s.errorSource).toBeNull();
  });

  it('rejected: status → idle (NOT error), errorSource → authForm — R2-BUG-005', () => {
    const action = login.rejected(null, '', { email: '', password: '' }, 'Invalid credentials');
    const s = sessionReducer(init(), action);
    expect(s.status).toBe('idle');          // key: NOT 'error' → BootstrapLoader stays hidden
    expect(s.errorSource).toBe('authForm'); // key: inline form error shown
    expect(s.error).toBe('Invalid credentials');
  });

  it('rejected without payload: uses fallback message', () => {
    const action = login.rejected(null, '', { email: '', password: '' }, undefined);
    const s = sessionReducer(init(), action);
    expect(s.error).toBeTruthy();
    expect(s.errorSource).toBe('authForm');
  });

  it('fulfilled: errorSource cleared', () => {
    // Start with an authForm error then simulate success
    const stateWithError = sessionReducer(
      init(),
      login.rejected(null, '', { email: '', password: '' }, 'oops'),
    );
    expect(stateWithError.errorSource).toBe('authForm');

    const pair: AuthTokenPair = {
      accessToken: 'acc',
      refreshToken: 'ref',
      expiresIn: 900,
      user: { id: '1', name: 'Test', email: 't@t.com' },
    };
    const s = sessionReducer(stateWithError, login.fulfilled(pair, '', { email: '', password: '' }));
    expect(s.status).toBe('authenticated');
    expect(s.errorSource).toBeNull();
    expect(s.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------
describe('register thunk', () => {
  it('rejected: status → idle, errorSource → authForm — R2-BUG-004', () => {
    const action = register.rejected(null, '', { email: '', password: '', name: '' }, 'Email already registered');
    const s = sessionReducer(init(), action);
    expect(s.status).toBe('idle');
    expect(s.errorSource).toBe('authForm');
    expect(s.error).toBe('Email already registered');
  });
});

// ---------------------------------------------------------------------------
// observerJoin
// ---------------------------------------------------------------------------
describe('observerJoin thunk', () => {
  it('rejected: status → idle, errorSource → authForm — B7-BUG-003', () => {
    const action = observerJoin.rejected(null, '', { inviteCode: 'bad', name: 'X' }, 'Invalid invitation');
    const s = sessionReducer(init(), action);
    expect(s.status).toBe('idle');
    expect(s.errorSource).toBe('authForm');
    expect(s.error).toBe('Invalid invitation');
  });
});

// ---------------------------------------------------------------------------
// bootstrapSession
// ---------------------------------------------------------------------------
describe('bootstrapSession thunk', () => {
  it('rejected NETWORK_ERROR: status → error, errorSource → bootstrap (BootstrapLoader shown)', () => {
    const action = bootstrapSession.rejected(null, '', undefined, 'NETWORK_ERROR');
    const s = sessionReducer(init(), action);
    expect(s.status).toBe('error');
    expect(s.errorSource).toBe('bootstrap'); // Only this source triggers BootstrapLoader in App.tsx
  });

  it('rejected ABORTED: status stays bootstrapping, errorSource stays null', () => {
    const action = bootstrapSession.rejected(null, '', undefined, 'ABORTED');
    const s = sessionReducer(init(), action);
    expect(s.status).toBe('bootstrapping');
    expect(s.errorSource).toBeNull();
  });

  it('pending: errorSource cleared', () => {
    // Start with a bootstrap error state, then a retry fires pending
    const errState = sessionReducer(
      init(),
      bootstrapSession.rejected(null, '', undefined, 'NETWORK_ERROR'),
    );
    expect(errState.errorSource).toBe('bootstrap');
    const s = sessionReducer(errState, bootstrapSession.pending('', undefined, undefined));
    expect(s.errorSource).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearError / clearSession
// ---------------------------------------------------------------------------
describe('clearError action', () => {
  it('resets both error and errorSource', () => {
    const stateWithErr = sessionReducer(
      init(),
      login.rejected(null, '', { email: '', password: '' }, 'oops'),
    );
    const s = sessionReducer(stateWithErr, clearError());
    expect(s.error).toBeNull();
    expect(s.errorSource).toBeNull();
  });
});

describe('clearSession action', () => {
  it('resets errorSource to null', () => {
    const stateWithErr = sessionReducer(
      init(),
      bootstrapSession.rejected(null, '', undefined, 'NETWORK_ERROR'),
    );
    const s = sessionReducer(stateWithErr, clearSession());
    expect(s.errorSource).toBeNull();
    expect(s.status).toBe('idle');
  });
});

// ---------------------------------------------------------------------------
// invariant: errorSource='authForm' must never coincide with status='error'
// (status='error' is exclusively for bootstrap network failures)
// ---------------------------------------------------------------------------
describe('invariant: authForm errors never set status=error', () => {
  const authFormActions = [
    login.rejected(null, '', { email: '', password: '' }, 'err'),
    register.rejected(null, '', { email: '', password: '', name: '' }, 'err'),
    observerJoin.rejected(null, '', { inviteCode: '', name: '' }, 'err'),
  ];

  authFormActions.forEach((action) => {
    it(`${action.type} does not set status='error'`, () => {
      const s = sessionReducer(init(), action);
      expect(s.status).not.toBe('error');
      expect(s.errorSource).toBe('authForm');
    });
  });
});
