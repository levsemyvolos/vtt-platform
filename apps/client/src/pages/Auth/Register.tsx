import { useState, type FormEvent } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { register, clearError } from '../../store/session';

type Props = {
  onSwitchToLogin: () => void;
};

export default function Register({ onSwitchToLogin }: Props) {
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector((s) => s.session);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (name.trim().length < 2) return "Ім'я — мінімум 2 символи";
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
    void dispatch(register({ email, password, name: name.trim() }));
  };

  const displayError = localError ?? error;

  return (
    <div className="auth-form">
      <h1>Реєстрація</h1>
      <form onSubmit={handleSubmit} aria-label="форма реєстрації">
        <div className="field">
          <label htmlFor="reg-name">{"Ім'я"}</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="reg-email">Email</label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="reg-password">Пароль</label>
          <input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {displayError && (
          <p role="alert" className="error">
            {displayError}
          </p>
        )}
        <button type="submit" disabled={status === 'loading'}>
          {status === 'loading' ? 'Реєстрація…' : 'Зареєструватись'}
        </button>
      </form>
      <button type="button" onClick={onSwitchToLogin}>
        Вже маю акаунт
      </button>
    </div>
  );
}
