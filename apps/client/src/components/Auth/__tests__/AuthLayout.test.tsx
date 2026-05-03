import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import preferencesReducer from '../../../store/preferences';
import AuthLayout from '../AuthLayout';

afterEach(() => { cleanup(); });

function makeStore() {
  return configureStore({ reducer: { preferences: preferencesReducer } });
}

describe('AuthLayout', () => {
  it('renders Logo corner and VTT text', () => {
    render(
      <Provider store={makeStore()}>
        <AuthLayout><span>child</span></AuthLayout>
      </Provider>,
    );
    expect(screen.getByText('VTT')).toBeTruthy();
  });

  it('renders passed children inside the card', () => {
    render(
      <Provider store={makeStore()}>
        <AuthLayout><span data-testid="card-child">content</span></AuthLayout>
      </Provider>,
    );
    expect(screen.getByTestId('card-child')).toBeTruthy();
  });
});
