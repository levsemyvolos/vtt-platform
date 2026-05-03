import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { login, clearError } from '../../store/session';
import { Tabs, Button, Input } from '../../components/ui';
import { AuthLayout } from '../../components/Auth';
import styles from './Auth.module.css';


type TabId = 'login' | 'register';

type Props = {
  onSwitchToRegister: () => void;
  onSwitchToObserver: () => void;
  onSwitchToLanding?: () => void;
};

export default function Login({ onSwitchToRegister, onSwitchToObserver, onSwitchToLanding }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['auth', 'common', 'errors']);
  const { status, error, prefilledInviteCode } = useAppSelector((s) => s.session);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const tabItems: ReadonlyArray<{ id: TabId; label: string }> = [
    { id: 'login', label: t('auth:tabs.login') },
    { id: 'register', label: t('auth:tabs.register') },
  ];

  const validate = (): string | null => {
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
    void dispatch(login({ email, password }));
  };

  // Translate i18n keys that may arrive from Redux (e.g. 'errors:server.generic').
  const rawError = localError ?? error;
  const displayError = rawError
    ? /^[\w]+:[\w.]+$/.test(rawError) ? t(rawError as never, rawError) : rawError
    : null;

  return (
    <AuthLayout>
      {onSwitchToLanding && (
        <button type="button" className={styles.backLink} onClick={onSwitchToLanding}>
          {t('auth:links.backToLanding')}
        </button>
      )}
      <h1 className={styles.heading}>{t('auth:headline.login')}</h1>
      {prefilledInviteCode ? (
        <p className={styles.subtitle}>
          {t('auth:observer.invitePrefilled')}{' '}
          <button
            type="button"
            className={styles.inlineLink}
            onClick={onSwitchToObserver}
          >
            {t('auth:observer.linkLabel')}
          </button>
        </p>
      ) : (
        <p className={styles.subtitle}>{t('auth:subtitle')}</p>
      )}
      <div className={styles.tabsRow}>
        <Tabs
          variant="pill"
          items={tabItems}
          value="login"
          onChange={(id) => { if (id === 'register') onSwitchToRegister(); }}
          ariaLabel={t('auth:tabs.login')}
        />
      </div>
      <form onSubmit={handleSubmit} aria-label={t('auth:login.formLabel')} className={styles.form}>
        <Input
          label={t('common:label.email')}
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          fullWidth
        />
        <Input
          label={t('common:label.password')}
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          fullWidth
        />
        {displayError && (
          <p role="alert" className={styles.error}>{displayError}</p>
        )}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          isLoading={status === 'loading'}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? t('auth:login.loading') : t('auth:login.submitBtn')}
        </Button>
      </form>
      <div className={styles.divider} />
      <Button
        type="button"
        variant="ghost"
        fullWidth
        onClick={onSwitchToObserver}
      >
        {t('auth:observer.linkLabel')}
      </Button>
    </AuthLayout>
  );
}
