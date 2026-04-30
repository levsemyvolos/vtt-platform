import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { login, clearError } from '../../store/session';

type Props = {
  onSwitchToRegister: () => void;
  onSwitchToObserver: () => void;
};

export default function Login({ onSwitchToRegister, onSwitchToObserver }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const { status, error } = useAppSelector((s) => s.session);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!email.includes('@')) return t('errors:validation.emailInvalid');
    if (password.length < 8) return t('errors:validation.passwordTooShort');
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
      <h1>{t('auth:login.heading')}</h1>
      <form onSubmit={handleSubmit} aria-label={t('auth:login.formLabel')}>
        <div className="field">
          <label htmlFor="login-email">{t('common:label.email')}</label>
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
          <label htmlFor="login-password">{t('common:label.password')}</label>
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
          {status === 'loading' ? t('auth:login.loading') : t('auth:login.submitBtn')}
        </button>
      </form>
      <div className="auth-links">
        <button type="button" onClick={onSwitchToRegister}>
          {t('auth:links.switchToRegister')}
        </button>
        <button type="button" onClick={onSwitchToObserver}>
          {t('auth:links.switchToObserver')}
        </button>
      </div>
    </div>
  );
}
