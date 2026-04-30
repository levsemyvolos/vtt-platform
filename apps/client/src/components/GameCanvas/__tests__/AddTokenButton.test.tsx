import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import sceneReducer from '../../../store/scene';
import AddTokenButton from '../AddTokenButton';

afterEach(() => { cleanup(); });

function makeStore() {
  return configureStore({ reducer: { scene: sceneReducer } });
}

function renderButton(myRole: 'GM' | 'Player' | 'Observer') {
  return render(
    <Provider store={makeStore()}>
      <AddTokenButton myRole={myRole} sceneId="scene-1" />
    </Provider>,
  );
}

describe('AddTokenButton — RBAC', () => {
  it('renders add-token button for GM', () => {
    renderButton('GM');
    expect(screen.getByRole('button', { name: /токен/i })).toBeTruthy();
  });

  it('renders nothing for Player', () => {
    renderButton('Player');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders nothing for Observer', () => {
    renderButton('Observer');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
