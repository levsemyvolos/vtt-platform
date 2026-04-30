import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

// vite.config.ts sets test.globals=false → @testing-library/react does NOT
// auto-register afterEach(cleanup). Without this, components from previous
// tests remain mounted in jsdom and `getByLabelText` finds duplicates.
afterEach(cleanup);
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ReactElement } from 'react';

// vi.mock is hoisted by vitest before all imports
vi.mock('../src/api/apiFetch', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
    }
  },
}));

import { apiFetch, ApiError } from '../src/api/apiFetch';
import sessionReducer from '../src/store/session';
import roomReducer from '../src/store/room';
import Login from '../src/pages/Auth/Login';
import Register from '../src/pages/Auth/Register';

const mockApiFetch = vi.mocked(apiFetch);

function makeStore() {
  return configureStore({
    reducer: { session: sessionReducer, room: roomReducer },
  });
}

function wrap(ui: ReactElement) {
  const s = makeStore();
  return { store: s, ...render(<Provider store={s}>{ui}</Provider>) };
}

const noOp = vi.fn();

const VALID_TOKEN_PAIR = {
  accessToken: 'access-tok',
  refreshToken: 'refresh-tok',
  expiresIn: 900,
  user: { id: '1', email: 'test@example.com', name: 'Test User' },
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

describe('Login', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders email and password fields', () => {
    wrap(<Login onSwitchToRegister={noOp} onSwitchToObserver={noOp} />);
    expect(screen.getByLabelText('Email')).toBeDefined();
    expect(screen.getByLabelText('Пароль')).toBeDefined();
  });

  it('shows validation error for invalid email', async () => {
    wrap(<Login onSwitchToRegister={noOp} onSwitchToObserver={noOp} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'notanemail' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'форма входу' }));
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('shows validation error for password shorter than 8 chars', async () => {
    wrap(<Login onSwitchToRegister={noOp} onSwitchToObserver={noOp} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'short' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'форма входу' }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toContain('8 символів');
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('calls apiFetch with correct payload on valid submit', async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_TOKEN_PAIR);

    wrap(<Login onSwitchToRegister={noOp} onSwitchToObserver={noOp} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'форма входу' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('shows server 401 error message', async () => {
    mockApiFetch.mockRejectedValueOnce(new ApiError(401, 'Невірний email або пароль'));

    wrap(<Login onSwitchToRegister={noOp} onSwitchToObserver={noOp} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'wrongpass1' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'форма входу' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent ?? '').toContain('Невірний email або пароль');
  });

  it('disables the submit button while loading', async () => {
    // Never resolves — keeps loading state
    mockApiFetch.mockReturnValueOnce(new Promise(() => undefined));

    wrap(<Login onSwitchToRegister={noOp} onSwitchToObserver={noOp} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'форма входу' }));

    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /вхід…/i });
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

describe('Register', () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders name, email and password fields", () => {
    wrap(<Register onSwitchToLogin={noOp} />);
    expect(screen.getByLabelText("Ім'я")).toBeDefined();
    expect(screen.getByLabelText('Email')).toBeDefined();
    expect(screen.getByLabelText('Пароль')).toBeDefined();
  });

  it('shows validation error when name is too short', async () => {
    wrap(<Register onSwitchToLogin={noOp} />);
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'password123' },
    });
    // leave name empty
    fireEvent.submit(screen.getByRole('form', { name: 'форма реєстрації' }));
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('calls apiFetch with correct payload on valid submit', async () => {
    mockApiFetch.mockResolvedValueOnce(VALID_TOKEN_PAIR);

    wrap(<Register onSwitchToLogin={noOp} />);
    fireEvent.change(screen.getByLabelText("Ім'я"), {
      target: { value: 'Test User' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'password123' },
    });
    fireEvent.submit(screen.getByRole('form', { name: 'форма реєстрації' }));

    await waitFor(() =>
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/auth/register',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
