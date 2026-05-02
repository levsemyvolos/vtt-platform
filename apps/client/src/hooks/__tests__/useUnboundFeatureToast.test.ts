import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import React, { createElement } from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import toastReducer from '../../store/toast';
import { useUnboundFeatureToast } from '../useUnboundFeatureToast';

afterEach(() => cleanup());

function makeStore() {
  return configureStore({ reducer: { toast: toastReducer } });
}

function wrapper(store: ReturnType<typeof makeStore>) {
  return ({ children }: { children: React.ReactNode }) =>
    createElement(Provider, { store, children });
}

describe('useUnboundFeatureToast', () => {
  it('dispatches an info toast and calls console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = makeStore();
    const { result } = renderHook(() => useUnboundFeatureToast(), {
      wrapper: wrapper(store),
    });

    act(() => {
      result.current('Ruler');
    });

    const queue = store.getState().toast.queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]?.variant).toBe('info');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Ruler'));
    warnSpy.mockRestore();
  });

  it('returns a stable function reference', () => {
    const store = makeStore();
    const { result, rerender } = renderHook(() => useUnboundFeatureToast(), {
      wrapper: wrapper(store),
    });
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
