import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import assistantReducer from '../../../store/assistant';
import DialogList from '../DialogList';

afterEach(() => { cleanup(); });

function makeStore() {
  return configureStore({ reducer: { assistant: assistantReducer } });
}

describe('DialogList', () => {
  it('renders "+ Новий діалог" button', () => {
    const store = makeStore();
    render(<Provider store={store}><DialogList roomId="r1" /></Provider>);
    expect(screen.getByRole('button', { name: '+ Новий діалог' })).toBeTruthy();
  });

  it('renders all 4 context items', () => {
    const store = makeStore();
    render(<Provider store={store}><DialogList roomId="r1" /></Provider>);
    expect(screen.getByText('NPC')).toBeTruthy();
    expect(screen.getByText('Сцена')).toBeTruthy();
    expect(screen.getByText('SRD')).toBeTruthy();
    expect(screen.getByText('Вільний')).toBeTruthy();
  });
});
