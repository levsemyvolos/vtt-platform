import { useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { login, clearError } from '../../store/session';

type Props = {
  onSwitchToRegister: () => void;
  onSwitchToObserver: () => void;
};

export default function Login({ onSwitchToRegister, onSwitchToObserver }: Props) {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.session);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!email.includes('@')) return 'Введіть коректний email';
    if (password.length < 8) return 'Пароль — мінімум 8 символів';
    return null;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch(clearError());
    const err = validate();
    if (err) {
      setLocalError(err);
      return;
    }
    setLocalError(null);
    void dispatch(login({ email, password }));
  };

  const displayError = localError ?? error;

  return (
    <div className="auth-form">
      <h1>Вхід</h1>
      <form onSubmit={handleSubmit} aria-label="форма входу">
        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Пароль</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        {displayError && (
          <p role="alert" className="error">
            {displayError}
          </p>
        )}
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Вхід…' : 'Увійти'}
        </button>
      </form>
      <div className="auth-links">
        <button type="button" onClick={onSwitchToRegister}>
          Зареєструватись
        </button>
        <button type="button" onClick={onSwitchToObserver}>
          Увійти як Спостерігач
        </button>
      </div>
    </div>
  );
}
