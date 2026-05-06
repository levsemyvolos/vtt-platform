import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import roomReducer from '../../../store/room';
import sessionReducer from '../../../store/session';
import scenesReducer from '../../../store/scenes';
import sceneReducer from '../../../store/scene';
import preferencesReducer from '../../../store/preferences';
import mediaReducer from '../../../store/media';
import toastReducer from '../../../store/toast';
import GameRoomTopBar from '../GameRoomTopBar';
import type { RoomDTO, RoomMemberDTO } from '@vtt/shared';

afterEach(() => cleanup());

vi.mock('../../../api/socket', () => ({
  getSocket: () => ({ connected: true, on: vi.fn(), off: vi.fn() }),
}));

const member: RoomMemberDTO = { userId: 'u1', name: 'Andrii', role: 'GM' };
const room: RoomDTO = {
  id: 'r1',
  name: 'Прокляття Страда',
  gameSystem: 'D&D 5e',
  status: 'active',
  ownerId: 'u1',
  members: [member],
  createdAt: '2026-01-01T00:00:00Z',
  lastActiveAt: '2026-01-01T00:00:00Z',
};

function makeStore() {
  return configureStore({
    reducer: {
      room: roomReducer,
      session: sessionReducer,
      scenes: scenesReducer,
      scene: sceneReducer,
      preferences: preferencesReducer,
      media: mediaReducer,
      toast: toastReducer,
    },
    preloadedState: {
      room: {
        currentRoom: room,
        ownRooms: [],
        members: [member],
        status: 'loaded' as const,
        error: null,
        sessionActive: true,
        editingSceneId: null,
      },
      session: {
        currentUser: { id: 'u1', email: 'gm@test.com', name: 'Andrii' },
        accessToken: 'tok',
        status: 'authenticated' as const,
        error: null,
        errorSource: null,
        prefilledInviteCode: null,
      },
    },
  });
}

describe('GameRoomTopBar', () => {
  it('renders breadcrumb with room name', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameRoomTopBar myRole="GM" sidebarCollapsed={false} onToggleSidebar={() => {}} />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText('Кімнати')).toBeTruthy();
    expect(screen.getByText('Прокляття Страда')).toBeTruthy();
  });

  it('renders GM role badge', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameRoomTopBar myRole="GM" sidebarCollapsed={false} onToggleSidebar={() => {}} />
        </MemoryRouter>
      </Provider>,
    );
    expect(screen.getByText('Ведучий')).toBeTruthy();
  });

  it('renders WSS dot', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <GameRoomTopBar myRole="GM" sidebarCollapsed={false} onToggleSidebar={() => {}} />
        </MemoryRouter>
      </Provider>,
    );
    const dot = document.querySelector('[title]');
    expect(dot).toBeTruthy();
  });
});
