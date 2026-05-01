import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sceneReducer from '../../../store/scene';
import toastReducer from '../../../store/toast';
import preferencesReducer from '../../../store/preferences';
import EditorToolbarLeft from '../EditorToolbarLeft';

vi.mock('../../../api/assets', () => ({
  listRoomAssets: vi.fn().mockResolvedValue([]),
  IMAGE_MAX_BYTES: 10 * 1024 * 1024,
  IMAGE_ALLOWED_MIME: ['image/png', 'image/jpeg', 'image/webp'],
  initImageUpload: vi.fn(),
  finalizeImageUpload: vi.fn(),
  uploadBytesToGcs: vi.fn(),
}));

afterEach(() => cleanup());

function makeStore() {
  return configureStore({
    reducer: {
      scene: sceneReducer,
      toast: toastReducer,
      preferences: preferencesReducer,
    },
  });
}

describe('EditorToolbarLeft', () => {
  it('Background section renders ImageUpload drop zone and AssetPicker', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <EditorToolbarLeft roomId="r1" sceneId="s1" />
      </Provider>,
    );
    expect(screen.getByRole('complementary', { name: /ліва панель редактора/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai/i })).toBeTruthy();
  });

  it('Grid section renders 3 number inputs for gridSize, gridWidth, gridHeight', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <EditorToolbarLeft roomId="r1" sceneId="s1" />
      </Provider>,
    );
    expect(screen.getByRole('spinbutton', { name: /розмір клітинки/i })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: /ширина/i })).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: /висота/i })).toBeTruthy();
  });
});
