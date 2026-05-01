import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { observerJoin, clearError } from '../../store/session';
import { fetchRoom } from '../../store/room';
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
    <div className={styles.authForm}>
      <h1>{t('auth:observer.heading')}</h1>
      <form onSubmit={(e) => void handleSubmit(e)} aria-label={t('auth:observer.formLabel')}>
        <div className={styles.field}>
          <label htmlFor="obs-code">{t('auth:observer.inviteCodeLabel')}</label>
          <input
            id="obs-code"
            type="text"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            autoComplete="off"
            required
            aria-required="true"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="obs-name">{t('auth:observer.yourNameLabel')}</label>
          <input
            id="obs-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
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
          {status === 'loading' ? t('auth:observer.loading') : t('auth:observer.submitBtn')}
        </button>
      </form>
      <div className={styles.links}>
        <button type="button" onClick={onSwitchToLogin}>
          {t('auth:links.backToLogin')}
        </button>
      </div>
    </div>
  );
}
