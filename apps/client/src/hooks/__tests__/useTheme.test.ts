import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import React, { createElement } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import preferencesReducer from '../../store/preferences';
import { setTheme } from '../../store/preferences';
import { useTheme } from '../useTheme';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

type MqListener = (e: MediaQueryListEvent) => void;

function makeMq(prefersDark: boolean) {
  const listeners: MqListener[] = [];
  const mq = {
    matches: prefersDark,
    addEventListener: vi.fn((_: string, fn: MqListener) => listeners.push(fn)),
    removeEventListener: vi.fn(),
    // helper to simulate OS theme change
    _fire: (dark: boolean) => {
      listeners.forEach((fn) => fn({ matches: dark } as MediaQueryListEvent));
    },
  };
  return mq;
}

function makeStore(theme: 'light' | 'dark' | 'system' = 'system') {
  return configureStore({
    reducer: { preferences: preferencesReducer },
    preloadedState: { preferences: { theme } },
  });
}

function wrapper(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
}

describe('useTheme', () => {
  it('resolves "light" when mode is light', () => {
    const mq = makeMq(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mq as unknown as MediaQueryList);
    const store = makeStore('light');

    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('resolves "dark" when mode is dark', () => {
    const mq = makeMq(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mq as unknown as MediaQueryList);
    const store = makeStore('dark');

    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('resolves system → light when OS is light', () => {
    const mq = makeMq(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mq as unknown as MediaQueryList);
    const store = makeStore('system');

    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('resolves system → dark when OS is dark', () => {
    const mq = makeMq(true);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mq as unknown as MediaQueryList);
    const store = makeStore('system');

    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('reacts to OS theme change in system mode', () => {
    const mq = makeMq(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mq as unknown as MediaQueryList);
    const store = makeStore('system');

    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('light');

    act(() => { mq._fire(true); });

    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('updates dataset.theme when store theme changes', () => {
    const mq = makeMq(false);
    vi.spyOn(window, 'matchMedia').mockReturnValue(mq as unknown as MediaQueryList);
    const store = makeStore('light');

    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('light');

    act(() => { store.dispatch(setTheme('dark')); });

    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
