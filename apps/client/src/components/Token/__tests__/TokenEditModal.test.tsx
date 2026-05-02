import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sceneReducer, { hydrateScene } from '../../../store/scene';
import roomReducer from '../../../store/room';
import TokenEditModal from '../TokenEditModal';
import type { SceneDTO } from '@vtt/shared';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const mockToken = {
  id: 'tok-1', name: 'Hero', x: 2, y: 3, sceneId: 'scene-1',
  imageUrl: '', version: 1, color: '#7c5cff',
  hp: 10, maxHp: 20, statusMarkers: [], assignedUserId: null,
};

const mockScene: SceneDTO = {
  id: 'scene-1', roomId: 'room-1', name: 'Scene', gridSize: 50,
  gridWidth: 20, gridHeight: 20, isActive: true, isHidden: false,
  fogMaskBase64: null, annotations: { strokes: [], texts: [], images: [] }, tokens: [mockToken],
};

function makeStore() {
  const s = configureStore({ reducer: { scene: sceneReducer, room: roomReducer } });
  s.dispatch(hydrateScene(mockScene));
  return s;
}

describe('TokenEditModal — RBAC render', () => {
  it('renders form fields for GM when token exists', () => {
    render(
      <Provider store={makeStore()}>
        <TokenEditModal tokenId="tok-1" onClose={() => undefined} />
      </Provider>,
    );
    expect(screen.getByDisplayValue('Hero')).toBeTruthy();
    expect(screen.getByDisplayValue('10')).toBeTruthy();
  });

  it('returns null when tokenId not found in scene', () => {
    render(
      <Provider store={makeStore()}>
        <TokenEditModal tokenId="nonexistent" onClose={() => undefined} />
      </Provider>,
    );
    expect(screen.queryByText('Редагувати токен')).toBeNull();
  });
});
