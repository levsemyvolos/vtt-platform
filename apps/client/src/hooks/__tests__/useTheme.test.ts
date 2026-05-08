import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup, act } from '@testing-library/react';
import React, { createElement } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import preferencesReducer from '../../store/preferences';
import { setTheme, type ThemeMode } from '../../store/preferences';
import { useTheme } from '../useTheme';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.theme;
});

function makeStore(theme: ThemeMode = 'dark') {
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
    const store = makeStore('light');
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('resolves "dark" when mode is dark', () => {
    const store = makeStore('dark');
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('updates dataset.theme when store theme changes', () => {
    const store = makeStore('light');
    const { result } = renderHook(() => useTheme(), { wrapper: wrapper(store) });
    expect(result.current).toBe('light');

    act(() => { store.dispatch(setTheme('dark')); });

    expect(result.current).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
