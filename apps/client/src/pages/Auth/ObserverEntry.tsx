import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { observerJoin, clearError, setPrefilledInviteCode } from '../../store/session';
import { fetchRoom } from '../../store/room';
import { Button, Input } from '../../components/ui';
import { AuthLayout } from '../../components/Auth';
import styles from './Auth.module.css';

type Props = {
  onSwitchToLogin: () => void;
  onSwitchToLanding?: () => void;
};

export default function ObserverEntry({ onSwitchToLogin, onSwitchToLanding }: Props) {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['auth', 'errors']);
  const { status, error, prefilledInviteCode } = useAppSelector((s) => s.session);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [inviteCode, setInviteCode] = useState(prefilledInviteCode ?? '');
  const [name, setName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Wave 2.2 — when the invite code comes pre-filled from URL, focus on name field.
  useEffect(() => {
    if (prefilledInviteCode) {
      setInviteCode(prefilledInviteCode);
      nameInputRef.current?.focus();
    }
  }, [prefilledInviteCode]);

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
      // Clear the prefilled code now that it has been consumed.
      dispatch(setPrefilledInviteCode(null));
      void dispatch(fetchRoom(result.payload.roomId));
    }
  };

  // Translate i18n keys that may arrive from Redux (e.g. 'errors:server.generic').
  const rawError = localError ?? error;
  const displayError = rawError
    ? /^[\w]+:[\w.]+$/.test(rawError) ? t(rawError as never, rawError) : rawError
    : null;
  const isPrefilled = Boolean(prefilledInviteCode);

  return (
    <AuthLayout>
      {onSwitchToLanding && (
        <button type="button" className={styles.backLink} onClick={onSwitchToLanding}>
          {t('auth:links.backToLanding')}
        </button>
      )}
      <h1 className={styles.heading}>{t('auth:observer.heading')}</h1>
      {isPrefilled && (
        <p className={styles.subtitle}>{t('auth:observer.invitePrefilled')}</p>
      )}
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
          onChange={(e) => { if (!isPrefilled) setInviteCode(e.target.value); }}
          autoComplete="off"
          required
          fullWidth
          disabled={isPrefilled}
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
          ref={nameInputRef}
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
