import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import sceneReducer, {
  hydrateScene,
  applyDraftSceneUpdate,
} from '../../../store/scene';
import roomReducer, { setCurrentRoom, startEditing } from '../../../store/room';
import canvasViewportReducer from '../../../store/canvasViewport';
import EditorTopBar from '../EditorTopBar';
import type { SceneDTO, RoomDTO } from '@vtt/shared';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockApiPatchScene = vi.fn();
vi.mock('../../../api/scenes', () => ({
  apiPatchScene: (...args: unknown[]) => mockApiPatchScene(...args),
}));

const mockFlushEditedScene = vi.fn();
vi.mock('../../../api/socket', () => ({
  flushEditedScene: (...args: unknown[]) => mockFlushEditedScene(...args),
}));

const mockApiFetch = vi.fn();
vi.mock('../../../api/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

// Mock the store module so EditorTopBar's `store.getState()` reads from
// the per-test configureStore instance rather than the production singleton.
// The typed hooks (useAppDispatch / useAppSelector) are delegated to
// react-redux's real useDispatch / useSelector which receive context from <Provider>.
let _testStoreGetState: (() => unknown) | null = null;
vi.mock('../../../store', async () => {
  return {
    store: {
      getState: () => (_testStoreGetState ? _testStoreGetState() : null),
    },
    useAppDispatch: () => useDispatch(),
    useAppSelector: (selector: (s: unknown) => unknown) => useSelector(selector),
  };
});

// ---------------------------------------------------------------------------
// Factories / fixtures
// ---------------------------------------------------------------------------

function makeMockScene(): SceneDTO {
  return {
    id: 'scene-1',
    roomId: 'room-1',
    name: 'Test Scene',
    gridSize: 50,
    gridWidth: 20,
    gridHeight: 15,
    gridVisible: true,
    isActive: true,
    isHidden: false,
    fogShapes: [],
    annotations: { schemaVersion: 2, strokes: [], texts: [], images: [], objects: [] },
    tokens: [],
  };
}

const MOCK_ROOM: RoomDTO = {
  id: 'room-1',
  name: 'Test Room',
  gameSystem: 'dnd5e',
  status: 'active',
  ownerId: 'u1',
  members: [],
  createdAt: '2024-01-01T00:00:00.000Z',
  lastActiveAt: '2024-01-01T00:00:00.000Z',
};

interface DraftPatch {
  gridSize?: number;
  gridWidth?: number;
  gridHeight?: number;
  gridVisible?: boolean;
  backgroundAssetId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStore(withDraft?: DraftPatch) {
  const s = configureStore({
    reducer: {
      scene: sceneReducer,
      room: roomReducer,
      canvasViewport: canvasViewportReducer,
    },
  });
  s.dispatch(hydrateScene(makeMockScene()));
  s.dispatch(setCurrentRoom(MOCK_ROOM));
  s.dispatch(startEditing('scene-1'));
  if (withDraft) {
    s.dispatch(applyDraftSceneUpdate({ patch: withDraft }));
  }
  // Wire the singleton mock to this test store so EditorTopBar's store.getState() works.
  _testStoreGetState = () => s.getState();
  return s;
}

function renderTopBar(store: ReturnType<typeof makeStore>) {
  return render(
    <Provider store={store}>
      <EditorTopBar />
    </Provider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  _testStoreGetState = null;
});

// ---------------------------------------------------------------------------
// handleDone tests
// ---------------------------------------------------------------------------

describe('EditorTopBar — handleDone', () => {
  beforeEach(() => {
    mockApiPatchScene.mockResolvedValue(makeMockScene());
    mockFlushEditedScene.mockReturnValue(undefined);
  });

  it('empty draft → does NOT call apiPatchScene', async () => {
    const store = makeStore(); // no draft → draftPatch is null
    renderTopBar(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /doneBtn/i }));
    });

    expect(mockApiPatchScene).not.toHaveBeenCalled();
  });

  it('empty draft → still calls flushEditedScene with roomId and sceneId', async () => {
    const store = makeStore();
    renderTopBar(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /doneBtn/i }));
    });

    expect(mockFlushEditedScene).toHaveBeenCalledOnce();
    expect(mockFlushEditedScene).toHaveBeenCalledWith('room-1', 'scene-1');
  });

  it('non-empty draft → calls apiPatchScene with sceneId and draft, no staged opt', async () => {
    const draft: DraftPatch = { gridSize: 60, gridVisible: false };
    const store = makeStore(draft);
    renderTopBar(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /doneBtn/i }));
    });

    expect(mockApiPatchScene).toHaveBeenCalledOnce();
    const [sceneId, patchArg, optsArg] = mockApiPatchScene.mock.calls[0] as [
      string,
      DraftPatch,
      unknown,
    ];
    expect(sceneId).toBe('scene-1');
    expect(patchArg).toMatchObject({ gridSize: 60, gridVisible: false });
    // No staged option — must be called without a third argument
    expect(optsArg).toBeUndefined();
  });

  it('non-empty draft → draftPatch is null after successful Done flush', async () => {
    const draft: DraftPatch = { gridSize: 60 };
    const store = makeStore(draft);

    expect(store.getState().scene.draftPatch).not.toBeNull();

    renderTopBar(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /doneBtn/i }));
    });

    expect(store.getState().scene.draftPatch).toBeNull();
  });

  it('Done button gets disabled attribute while async flush is in-flight', async () => {
    let resolvePatch!: (v: SceneDTO) => void;
    mockApiPatchScene.mockReturnValue(
      new Promise<SceneDTO>((res) => {
        resolvePatch = res;
      }),
    );

    const draft: DraftPatch = { gridSize: 60 };
    const store = makeStore(draft);
    renderTopBar(store);

    const doneBtn = screen.getByRole('button', { name: /doneBtn/i });

    // Click (triggers async handleDone which awaits apiPatchScene)
    fireEvent.click(doneBtn);

    // After the first microtask the component sets busy=true and renders disabled
    await waitFor(() => {
      expect((doneBtn as HTMLButtonElement).disabled).toBe(true);
    });

    // Resolve the PATCH — component sets busy=false
    await act(async () => {
      resolvePatch(makeMockScene());
    });

    expect((doneBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('Done on PATCH error → still dispatches stopEditing and calls flushEditedScene', async () => {
    mockApiPatchScene.mockRejectedValue(new Error('network'));

    const draft: DraftPatch = { gridSize: 70 };
    const store = makeStore(draft);
    renderTopBar(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /doneBtn/i }));
    });

    // Despite error, flow continues: stopEditing dispatched
    expect(store.getState().room.editingSceneId).toBeNull();
    // flushEditedScene still called
    expect(mockFlushEditedScene).toHaveBeenCalledOnce();
    // draftPatch cleared even on error path
    expect(store.getState().scene.draftPatch).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// handleCancel tests
// ---------------------------------------------------------------------------

describe('EditorTopBar — handleCancel', () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue(makeMockScene());
  });

  it('refetches scene and hydrateScene resets draftPatch to null (Mini-A)', async () => {
    const draft: DraftPatch = { gridSize: 99 };
    const store = makeStore(draft);

    expect(store.getState().scene.draftPatch).not.toBeNull();

    renderTopBar(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancelBtn/i }));
    });

    // hydrateScene (dispatched by cancel) resets draftPatch per Mini-A
    expect(store.getState().scene.draftPatch).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/scenes/scene-1');
  });

  it('Cancel on fetch-error → still clears draftPatch and exits edit mode', async () => {
    mockApiFetch.mockRejectedValue(new Error('network'));

    const draft: DraftPatch = { gridSize: 88 };
    const store = makeStore(draft);
    renderTopBar(store);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /cancelBtn/i }));
    });

    // clearDraftSceneUpdate is dispatched in catch block
    expect(store.getState().scene.draftPatch).toBeNull();
    // exitEditMode called in finally
    expect(store.getState().room.editingSceneId).toBeNull();
  });
});
