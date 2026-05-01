import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../api/apiFetch';
import styles from './InviteLink.module.css';

interface InviteTokens {
  playerToken: string;
  observerToken: string;
}

interface InviteLinkProps {
  roomId: string;
}

export default function InviteLink({ roomId }: InviteLinkProps): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const [tokens, setTokens] = useState<InviteTokens | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'player' | 'observer' | null>(null);

  async function fetchTokens(): Promise<void> {
    if (tokens) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<InviteTokens>(`/api/rooms/${roomId}/invites`, {
        method: 'POST',
      });
      setTokens(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:network.inviteFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(token: string, type: 'player' | 'observer'): Promise<void> {
    const url = `${window.location.origin}/?invite=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(t('errors:network.copyFailed'));
    }
  }

  return (
    <div className={styles.container}>
      {!tokens && !loading && (
        <button
          type="button"
          className={styles.btnInvite}
          onClick={() => void fetchTokens()}
          title={t('room:invite.inviteBtnTitle')}
        >
          {t('room:invite.inviteBtn')}
        </button>
      )}

      {loading && <span className={styles.status}>{t('common:status.loading')}</span>}

      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {tokens && (
        <div className={styles.panel}>
          <div className={styles.row}>
            <span className={styles.label}>{t('room:invite.playerLabel')}</span>
            <button
              type="button"
              className={styles.btnCopy}
              onClick={() => void copyToClipboard(tokens.playerToken, 'player')}
              title={`${window.location.origin}/?invite=${tokens.playerToken}`}
            >
              {copied === 'player' ? t('room:invite.copied') : t('room:invite.copyBtn')}
            </button>
          </div>
          <div className={styles.row}>
            <span className={styles.label}>{t('room:invite.observerLabel')}</span>
            <button
              type="button"
              className={styles.btnCopy}
              onClick={() => void copyToClipboard(tokens.observerToken, 'observer')}
              title={`${window.location.origin}/?invite=${tokens.observerToken}`}
            >
              {copied === 'observer' ? t('room:invite.copied') : t('room:invite.copyBtn')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
