import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { register, clearError } from '../../store/session';
import styles from './Auth.module.css';

type Props = {
  onSwitchToLogin: () => void;
};

export default function Register({ onSwitchToLogin }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const { status, error } = useAppSelector((s) => s.session);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (name.trim().length < 2) return t('errors:validation.nameTooShort');
    if (!email.includes('@')) return t('errors:validation.emailInvalid');
    if (password.length < 8) return t('errors:validation.passwordTooShort');
    return null;
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch(clearError());
    const err = validate();
    if (err) { setLocalError(err); return; }
    setLocalError(null);
    void dispatch(register({ email, password, name: name.trim() }));
  };

  const displayError = localError ?? error;

  return (
    <div className={styles.authForm}>
      <h1>{t('auth:register.heading')}</h1>
      <form onSubmit={handleSubmit} aria-label={t('auth:register.formLabel')}>
        <div className={styles.field}>
          <label htmlFor="reg-name">{t('auth:register.nameLabel')}</label>
          <input
            id="reg-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
            aria-required="true"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="reg-email">{t('common:label.email')}</label>
          <input
            id="reg-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            aria-required="true"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="reg-password">{t('common:label.password')}</label>
          <input
            id="reg-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            aria-required="true"
          />
        </div>
        {displayError && (
          <p role="alert" className={styles.error}>{displayError}</p>
        )}
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={status === 'loading'}
          aria-busy={status === 'loading'}
        >
          {status === 'loading' ? t('auth:register.loading') : t('auth:register.submitBtn')}
        </button>
      </form>
      <div className={styles.links}>
        <button type="button" onClick={onSwitchToLogin}>
          {t('auth:register.alreadyHaveAccount')}
        </button>
      </div>
    </div>
  );
}
