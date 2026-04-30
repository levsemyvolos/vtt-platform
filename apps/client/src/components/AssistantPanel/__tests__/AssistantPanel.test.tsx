import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import assistantReducer from '../../../store/assistant';
import AssistantPanel from '../AssistantPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function makeStore() {
  return configureStore({
    reducer: { assistant: assistantReducer },
  });
}

const ROOM_ID = 'room-test';

describe('AssistantPanel (Ф8.1)', () => {
  it('renders all 4 context tabs', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByRole('tab', { name: 'NPC' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Сцена' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'SRD' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Вільний' })).toBeTruthy();
  });

  it('switches active context when tab is clicked', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    const sceneTab = screen.getByRole('tab', { name: 'Сцена' });
    fireEvent.click(sceneTab);
    expect(store.getState().assistant.activeContext).toBe('scene-description');
  });

  it('calls onClose when close button is clicked', () => {
    const store = makeStore();
    const onClose = vi.fn();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={onClose} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows empty state message when no messages', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByText(/Задайте питання/)).toBeTruthy();
  });
});
