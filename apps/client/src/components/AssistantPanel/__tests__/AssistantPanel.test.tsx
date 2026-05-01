import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import assistantReducer from '../../../store/assistant';
import toastReducer from '../../../store/toast';
import AssistantPanel from '../AssistantPanel';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function makeStore() {
  return configureStore({
    reducer: {
      assistant: assistantReducer,
      toast: toastReducer,
    },
  });
}

const ROOM_ID = 'room-test';

describe('AssistantPanel 3-column overlay (Stage 7)', () => {
  it('renders 4 main tabs', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByRole('tab', { name: 'LLM-асистент' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Генерація зображень' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Генерація музики' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Історія' })).toBeTruthy();
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

  it('LLM tab shows empty state and aside column', () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByText(/Задайте питання/)).toBeTruthy();
    expect(container.querySelectorAll('aside').length).toBeGreaterThanOrEqual(1);
  });

  it('Image tab shows Generate button', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Генерація зображень' }));
    expect(screen.getByRole('button', { name: 'Генерувати' })).toBeTruthy();
  });

  it('Music tab shows Generate button', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Генерація музики' }));
    expect(screen.getByRole('button', { name: 'Генерувати' })).toBeTruthy();
  });
});
