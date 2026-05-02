import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { observerJoin, clearError } from '../../store/session';
import { fetchRoom } from '../../store/room';
import { Button, Input } from '../../components/ui';
import { AuthLayout } from '../../components/Auth';
import styles from './Auth.module.css';

type Props = {
  onSwitchToLogin: () => void;
};

export default function ObserverEntry({ onSwitchToLogin }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['auth', 'errors']);
  const { status, error } = useAppSelector((s) => s.session);

  const [inviteCode, setInviteCode] = useState('');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (!inviteCode.trim()) return t('errors:validation.inviteCodeRequired');
    if (name.trim().length < 2) return t('errors:validation.nameTooShort');
    return null;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    dispatch(clearError());
    const err = validate();
    if (err) { setLocalError(err); return; }
    setLocalError(null);
    const result = await dispatch(
      observerJoin({ inviteCode: inviteCode.trim(), name: name.trim() }),
    );
    if (observerJoin.fulfilled.match(result)) {
      void dispatch(fetchRoom(result.payload.roomId));
    }
  };

  const displayError = localError ?? error;

  return (
    <AuthLayout>
      <h1 className={styles.heading}>{t('auth:observer.heading')}</h1>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        aria-label={t('auth:observer.formLabel')}
        className={styles.form}
      >
        <Input
          label={t('auth:observer.inviteCodeLabel')}
          id="obs-code"
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          autoComplete="off"
          required
          fullWidth
        />
        <Input
          label={t('auth:observer.yourNameLabel')}
          id="obs-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
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
          {t('auth:observer.submitBtn')}
        </Button>
      </form>
      <div className={styles.divider} />
      <Button type="button" variant="ghost" fullWidth onClick={onSwitchToLogin}>
        {t('auth:links.backToLogin')}
      </Button>
    </AuthLayout>
  );
}
