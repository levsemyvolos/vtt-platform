import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../../api/apiFetch';
import styles from './InviteLink.module.css';

interface InviteTokens {
  playerToken: string;
  observerToken: string;
}

type CopiedKey = 'player-code' | 'player-link' | 'observer-code' | 'observer-link' | null;

interface InviteLinkProps {
  roomId: string;
}

export default function InviteLink({ roomId }: InviteLinkProps): JSX.Element {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const [tokens, setTokens] = useState<InviteTokens | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopiedKey>(null);

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

  async function copy(text: string, key: Exclude<CopiedKey, null>): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(t('errors:network.copyFailed'));
    }
  }

  const playerCode = tokens ? `p_${tokens.playerToken}` : '';
  const observerCode = tokens ? `o_${tokens.observerToken}` : '';
  const playerLink = tokens ? `${window.location.origin}/join/p_${tokens.playerToken}` : '';
  const observerLink = tokens ? `${window.location.origin}/join/o_${tokens.observerToken}` : '';

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
          <div className={styles.section}>
            <span className={styles.sectionLabel}>{t('room:invite.playerLabel')}</span>
            <div className={styles.row}>
              <span className={styles.label}>{t('room:invite.codeLabel')}</span>
              <code className={styles.codeText}>{playerCode}</code>
              <button
                type="button"
                className={styles.btnCopy}
                onClick={() => void copy(playerCode, 'player-code')}
              >
                {copied === 'player-code' ? t('room:invite.copied') : t('room:invite.copyCode')}
              </button>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>{t('room:invite.linkLabel')}</span>
              <button
                type="button"
                className={styles.btnCopy}
                onClick={() => void copy(playerLink, 'player-link')}
              >
                {copied === 'player-link' ? t('room:invite.copied') : t('room:invite.copyLink')}
              </button>
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>{t('room:invite.observerLabel')}</span>
            <div className={styles.row}>
              <span className={styles.label}>{t('room:invite.codeLabel')}</span>
              <code className={styles.codeText}>{observerCode}</code>
              <button
                type="button"
                className={styles.btnCopy}
                onClick={() => void copy(observerCode, 'observer-code')}
              >
                {copied === 'observer-code' ? t('room:invite.copied') : t('room:invite.copyCode')}
              </button>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>{t('room:invite.linkLabel')}</span>
              <button
                type="button"
                className={styles.btnCopy}
                onClick={() => void copy(observerLink, 'observer-link')}
              >
                {copied === 'observer-link' ? t('room:invite.copied') : t('room:invite.copyLink')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
