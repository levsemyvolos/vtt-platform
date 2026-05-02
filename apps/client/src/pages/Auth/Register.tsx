import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { register, clearError } from '../../store/session';
import { Tabs, Button, Input } from '../../components/ui';
import { AuthLayout } from '../../components/Auth';
import styles from './Auth.module.css';

type TabId = 'login' | 'register';

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

  const tabItems: ReadonlyArray<{ id: TabId; label: string }> = [
    { id: 'login', label: t('auth:tabs.login') },
    { id: 'register', label: t('auth:tabs.register') },
  ];

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
    <AuthLayout>
      <h1 className={styles.heading}>{t('auth:headline.register')}</h1>
      <p className={styles.subtitle}>{t('auth:subtitle')}</p>
      <div className={styles.tabsRow}>
        <Tabs
          variant="pill"
          items={tabItems}
          value="register"
          onChange={(id) => { if (id === 'login') onSwitchToLogin(); }}
          ariaLabel={t('auth:tabs.register')}
        />
      </div>
      <form onSubmit={handleSubmit} aria-label={t('auth:register.formLabel')} className={styles.form}>
        <Input
          label={t('auth:register.nameLabel')}
          id="reg-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
          fullWidth
        />
        <Input
          label={t('common:label.email')}
          id="reg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          fullWidth
        />
        <Input
          label={t('common:label.password')}
          id="reg-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
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
          {status === 'loading' ? t('auth:register.loading') : t('auth:register.submitBtn')}
        </Button>
      </form>
    </AuthLayout>
  );
}
