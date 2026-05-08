import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import CharacterSheetOverlay from '../CharacterSheetOverlay';
import sessionReducer from '../../../store/session';
import roomReducer from '../../../store/room';
import charactersReducer from '../../../store/characters';
import toastReducer from '../../../store/toast';
import preferencesReducer from '../../../store/preferences';

// Stub the heavy CharacterSheet body so we test only the overlay shell
vi.mock('../CharacterSheet', () => ({
  default: () => <div data-testid="character-sheet-body">sheet</div>,
}));

afterEach(() => cleanup());

function makeStore() {
  return configureStore({
    reducer: {
      session: sessionReducer,
      room: roomReducer,
      characters: charactersReducer,
      toast: toastReducer,
      preferences: preferencesReducer,
    },
  });
}

describe('CharacterSheetOverlay', () => {
  it('renders the body and a close button', () => {
    const onClose = vi.fn();
    const { getByTestId, getByRole } = render(
      <Provider store={makeStore()}>
        <CharacterSheetOverlay
          roomId="r1"
          myRole="GM"
          characterId={null}
          onClose={onClose}
        />
      </Provider>,
    );
    expect(getByTestId('character-sheet-body')).toBeTruthy();
    // button text is ✕; role+type is sufficient
    const closeBtn = getByRole('button');
    expect(closeBtn).toBeTruthy();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    const { getByRole } = render(
      <Provider store={makeStore()}>
        <CharacterSheetOverlay
          roomId="r1"
          myRole="GM"
          characterId="c1"
          onClose={onClose}
        />
      </Provider>,
    );
    fireEvent.click(getByRole('button'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(
      <Provider store={makeStore()}>
        <CharacterSheetOverlay
          roomId="r1"
          myRole="GM"
          characterId="c1"
          onClose={onClose}
        />
      </Provider>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
