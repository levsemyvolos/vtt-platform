import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sceneReducer, { hydrateScene, selectToken } from '../../../store/scene';
import toastReducer from '../../../store/toast';
import preferencesReducer from '../../../store/preferences';
import EditorToolbarRight from '../EditorToolbarRight';
import type { SceneDTO } from '@vtt/shared';

afterEach(() => cleanup());

const MOCK_SCENE: SceneDTO = {
  id: 's1',
  roomId: 'room-1',
  name: 'Test Scene',
  gridSize: 50,
  gridWidth: 20,
  gridHeight: 15,
  isActive: true,
  isHidden: false,
  fogMaskBase64: null,
  annotations: [],
  tokens: [
    {
      id: 'tk1',
      sceneId: 's1',
      name: 'Hero',
      imageUrl: 'https://example.com/hero.png',
      x: 5,
      y: 5,
      hp: 30,
      maxHp: 40,
      color: '#7c5cff',
      statusMarkers: [],
      assignedUserId: null,
      version: 1,
    },
  ],
};

function makeStore() {
  return configureStore({
    reducer: {
      scene: sceneReducer,
      toast: toastReducer,
      preferences: preferencesReducer,
    },
  });
}

describe('EditorToolbarRight', () => {
  it('shows no-selection hint when no token selected, then shows form when token selected', () => {
    const store = makeStore();
    store.dispatch(hydrateScene(MOCK_SCENE));

    const { rerender } = render(
      <Provider store={store}>
        <EditorToolbarRight />
      </Provider>,
    );

    expect(screen.getByTestId('no-token-selected')).toBeTruthy();

    store.dispatch(selectToken('tk1'));
    rerender(
      <Provider store={store}>
        <EditorToolbarRight />
      </Provider>,
    );

    expect(screen.getByTestId('token-properties')).toBeTruthy();
    const nameInput = screen.getByRole('textbox', { name: /name|назва/i });
    expect(nameInput).toBeTruthy();
  });
});
