import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import journalReducer from '../../../store/journal';
import roomReducer from '../../../store/room';
import sessionReducer from '../../../store/session';
import toastReducer from '../../../store/toast';
import preferencesReducer from '../../../store/preferences';
import assetsReducer from '../../../store/assets';
import JournalEditor from '../JournalEditor';
import type { JournalEntryDTO } from '@vtt/shared';

// Stub heavy sub-components
vi.mock('../AssetLibrary/AssetLibrary', () => ({
  default: () => <div data-testid="asset-library">AssetLibrary</div>,
}));
vi.mock('../../AssetLibrary/AssetLibrary', () => ({
  default: () => <div data-testid="asset-library">AssetLibrary</div>,
}));
vi.mock('../../AssetUpload/ImageUpload', () => ({
  default: () => <div data-testid="image-upload">ImageUpload</div>,
}));
vi.mock('../ImageLightbox', () => ({
  default: () => <div data-testid="lightbox">Lightbox</div>,
}));
vi.mock('../ShareModal', () => ({
  default: () => <div data-testid="share-modal">ShareModal</div>,
}));

afterEach(() => cleanup());

function makeEntry(overrides: Partial<JournalEntryDTO> = {}): JournalEntryDTO {
  return {
    id: 'entry-1',
    roomId: 'room-1',
    authorId: 'user-gm',
    title: 'Test Entry',
    body: 'Some body text',
    visibility: 'private',
    recipientIds: [],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeStore(entries: JournalEntryDTO[] = []) {
  return configureStore({
    reducer: {
      journal: journalReducer,
      room: roomReducer,
      session: sessionReducer,
      toast: toastReducer,
      preferences: preferencesReducer,
      assets: assetsReducer,
    },
    preloadedState: {
      journal: {
        entries,
        status: 'loaded' as const,
        error: null,
      },
    },
  });
}

describe('JournalEditor', () => {
  it('renders headingCreate when entryId is __new__', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="__new__"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.getByText('Новий запис журналу')).toBeTruthy();
  });

  it('renders headingEdit when valid entryId is provided', () => {
    const entry = makeEntry();
    const store = makeStore([entry]);
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="entry-1"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.getByText('Редагувати запис журналу')).toBeTruthy();
  });

  it('prepopulates title and body in edit mode', () => {
    const entry = makeEntry({ title: 'My Title', body: 'My body content' });
    const store = makeStore([entry]);
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="entry-1"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.getByDisplayValue('My Title')).toBeTruthy();
    expect(screen.getByDisplayValue('My body content')).toBeTruthy();
  });

  it('calls onClose when ESC key is pressed', () => {
    const onClose = vi.fn();
    const store = makeStore();
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="__new__"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={onClose}
        />
      </Provider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    const store = makeStore();
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="__new__"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={onClose}
        />
      </Provider>,
    );
    const cancelBtn = screen.getByText('Скасувати');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Save button is disabled when title is empty', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="__new__"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={vi.fn()}
        />
      </Provider>,
    );
    const saveBtn = screen.getByText('Зберегти');
    expect((saveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('Save button enabled when title is non-empty', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="__new__"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={vi.fn()}
        />
      </Provider>,
    );
    const titleInput = screen.getByPlaceholderText('Введіть заголовок…');
    fireEvent.change(titleInput, { target: { value: 'Hello' } });
    const saveBtn = screen.getByText('Зберегти');
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('Player (not author) sees read-only editor without Save/Delete', () => {
    const entry = makeEntry({ authorId: 'user-gm', visibility: 'shared', recipientIds: ['user-player'] });
    const store = makeStore([entry]);
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="entry-1"
          roomId="room-1"
          myUserId="user-player"
          myRole="Player"
          onClose={vi.fn()}
        />
      </Provider>,
    );
    expect(screen.queryByText('Зберегти')).toBeNull();
    expect(screen.queryByText('Видалити')).toBeNull();
    // Cancel button still visible in read-only mode
    expect(screen.getByText('Скасувати')).toBeTruthy();
  });

  it('calls onClose immediately when entry not found (stale)', () => {
    const onClose = vi.fn();
    const store = makeStore([]); // no entries
    render(
      <Provider store={store}>
        <JournalEditor
          entryId="nonexistent-id"
          roomId="room-1"
          myUserId="user-gm"
          myRole="GM"
          onClose={onClose}
        />
      </Provider>,
    );
    // onClose should have been called because entry is not found
    expect(onClose).toHaveBeenCalledOnce();
  });
});
