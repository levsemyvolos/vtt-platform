import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import canvasViewportReducer from '../../../store/canvasViewport';
import toastReducer from '../../../store/toast';
import preferencesReducer from '../../../store/preferences';
import sceneReducer from '../../../store/scene';
import undoHistoryReducer from '../../../store/undoHistory';
import roomReducer from '../../../store/room';
import CanvasToolbar from '../CanvasToolbar';
import type { SidebarTab } from '../types';

afterEach(() => cleanup());

function makeStore() {
  return configureStore({
    reducer: {
      canvasViewport: canvasViewportReducer,
      toast: toastReducer,
      preferences: preferencesReducer,
      scene: sceneReducer,
      undoHistory: undoHistoryReducer,
      room: roomReducer,
    },
  });
}

function renderToolbar(
  store: ReturnType<typeof makeStore>,
  role: 'GM' | 'Player' | 'Observer' = 'GM',
  onOpenTab: (tab: SidebarTab) => void = vi.fn(),
  onOpenAssistant: () => void = vi.fn(),
) {
  return render(
    <Provider store={store}>
      <CanvasToolbar myRole={role} onOpenTab={onOpenTab} onOpenAssistant={onOpenAssistant} />
    </Provider>,
  );
}

describe('CanvasToolbar', () => {
  it('renders Select and Ping buttons for all roles', () => {
    const store = makeStore();
    renderToolbar(store, 'Player');
    expect(screen.getByRole('button', { name: /вибір/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /пінг/i })).toBeTruthy();
  });

  it('renders Fog and AI buttons only for GM', () => {
    const gmStore = makeStore();
    const { unmount } = renderToolbar(gmStore, 'GM');
    expect(screen.getByRole('button', { name: /туман/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai/i })).toBeTruthy();
    unmount();

    const playerStore = makeStore();
    renderToolbar(playerStore, 'Player');
    expect(screen.queryByRole('button', { name: /туман/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /ai/i })).toBeNull();
  });

  it('clicking Select sets activeTool to select', () => {
    const store = makeStore();
    renderToolbar(store);
    fireEvent.click(screen.getByRole('button', { name: /вибір/i }));
    expect(store.getState().canvasViewport.activeTool).toBe('select');
  });

  it('clicking Ping sets activeTool to ping', () => {
    const store = makeStore();
    renderToolbar(store);
    fireEvent.click(screen.getByRole('button', { name: /пінг/i }));
    expect(store.getState().canvasViewport.activeTool).toBe('ping');
  });

  it('clicking Ruler sets activeTool to ruler (Ф3.4.3 — ruler is bound)', () => {
    const store = makeStore();
    renderToolbar(store);
    fireEvent.click(screen.getByRole('button', { name: /лінійка/i }));
    expect(store.getState().canvasViewport.activeTool).toBe('ruler');
    expect(store.getState().toast.queue).toHaveLength(0);
  });

  it('Draw tool is GM-only — not visible for Player', () => {
    const store = makeStore();
    renderToolbar(store, 'Player');
    expect(screen.queryByRole('button', { name: /малювання/i })).toBeNull();
  });

  it('Text and Image annotation tools are GM-only — sets activeTool without toast', () => {
    const store = makeStore();
    renderToolbar(store, 'GM');
    fireEvent.click(screen.getByRole('button', { name: /текст/i }));
    expect(store.getState().canvasViewport.activeTool).toBe('text');
    expect(store.getState().toast.queue).toHaveLength(0);
  });

  it('Text annotation tool not visible for Player', () => {
    const store = makeStore();
    renderToolbar(store, 'Player');
    expect(screen.queryByRole('button', { name: /текст/i })).toBeNull();
  });

  it('clicking Music calls onOpenTab("audio")', () => {
    const onOpenTab = vi.fn();
    const store = makeStore();
    renderToolbar(store, 'GM', onOpenTab);
    fireEvent.click(screen.getByRole('button', { name: /музика/i }));
    expect(onOpenTab).toHaveBeenCalledWith('audio');
  });

  it('clicking AI (GM) calls onOpenAssistant', () => {
    const onOpenAssistant = vi.fn();
    const store = makeStore();
    renderToolbar(store, 'GM', vi.fn(), onOpenAssistant);
    fireEvent.click(screen.getByRole('button', { name: /ai/i }));
    expect(onOpenAssistant).toHaveBeenCalledOnce();
  });

  it('zoom reset button sets zoom to 100%', () => {
    const store = makeStore();
    renderToolbar(store);
    fireEvent.click(screen.getByRole('button', { name: '100%' }));
    expect(store.getState().canvasViewport.zoom).toBe(1);
  });
});
