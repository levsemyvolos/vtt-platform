import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import assistantReducer from '../../../store/assistant';
import imageAssistantReducer from '../../../store/imageAssistant';
import toastReducer from '../../../store/toast';
import AssistantPanel from '../AssistantPanel';

// Stub the network layer so the conversation-list / image-thread / quota
// effects don't try to hit a real /api/ai endpoint when the panel mounts.
//
// Note: do NOT call vi.restoreAllMocks() in afterEach — that would call
// mockReset() on this vi.fn(), wiping the resolved-value implementation, so
// subsequent tests would see `apiFetch(...)` return undefined and crash on
// the `.catch()` chain inside RecentGenerations. We only need cleanup().
vi.mock('../../../api/apiFetch', () => ({
  apiFetch: vi.fn().mockResolvedValue({ conversations: [] }),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

afterEach(() => {
  cleanup();
});

function makeStore() {
  return configureStore({
    reducer: {
      assistant: assistantReducer,
      imageAssistant: imageAssistantReducer,
      toast: toastReducer,
    },
  });
}

const ROOM_ID = 'room-test';
const SEEDED_CONV_ID = 'conv-seed-id';

function buildSeededStore() {
  // Seed the redux store with one active conversation that has zero messages
  // — this is the precondition for `LlmPanel` to render the empty-state copy
  // ("Задайте питання GM-асистенту."). Without an active conversation the
  // panel shows the no-conversation hint instead.
  const store = configureStore({
    reducer: {
      assistant: assistantReducer,
      imageAssistant: imageAssistantReducer,
      toast: toastReducer,
    },
    preloadedState: {
      assistant: {
        conversations: {
          [SEEDED_CONV_ID]: {
            id: SEEDED_CONV_ID,
            roomId: ROOM_ID,
            ownerId: 'owner-stub',
            context: 'free-chat' as const,
            title: 'Seeded',
            defaults: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
        messages: { [SEEDED_CONV_ID]: [] },
        activeConversationId: SEEDED_CONV_ID,
        activeContext: 'free-chat' as const,
        status: 'idle' as const,
        error: null,
        conversationsLoaded: { [ROOM_ID]: true },
        messagesLoaded: { [SEEDED_CONV_ID]: true },
        rateLimitRemaining: null,
      },
    },
  });
  return store;
}

describe('AssistantPanel 3-column overlay (Stage 7)', () => {
  it('renders 4 main tabs', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByRole('tab', { name: 'Порадник' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Краєвиди' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Музика' })).toBeTruthy();

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

  it('LLM tab with an active conversation shows the empty-state hint and an aside column', () => {
    // Seed required: without an active conversation `LlmPanel` shows the
    // "виберіть діалог" copy instead of the empty-state hint we assert on.
    const store = buildSeededStore();
    const { container } = render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    expect(screen.getByText(/Поставте питання/)).toBeTruthy();
    expect(container.querySelectorAll('aside').length).toBeGreaterThanOrEqual(1);
  });

  it('Image tab shows the new-thread button (multi-turn rework, post-master-plan)', () => {
    // The Image tab no longer renders the legacy one-shot GeneratePanel. After
    // commit 9b0ba4d it shows ImageThreadList + ImageThreadView; the entry
    // affordance is the "+ Нова сцена" button on the threads list.
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Краєвиди' }));
    expect(screen.getByRole('button', { name: '+ Нова сцена' })).toBeTruthy();
  });

  it('Music tab shows Generate button', () => {
    // Music tab still uses the legacy one-shot GeneratePanel — the multi-turn
    // rework only touched the Image flow.
    const store = makeStore();
    render(
      <Provider store={store}>
        <AssistantPanel roomId={ROOM_ID} onClose={vi.fn()} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Музика' }));
    expect(screen.getByRole('button', { name: 'Генерувати' })).toBeTruthy();
  });
});
