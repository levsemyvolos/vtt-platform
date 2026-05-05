import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Link } from 'lucide-react';
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

export default function InviteLink({ roomId }: InviteLinkProps): JSX.Element | null {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const [tokens, setTokens] = useState<InviteTokens | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopiedKey>(null);
  const [activeTab, setActiveTab] = useState<'player' | 'observer'>('player');

  useEffect(() => {
    setLoading(true);
    apiFetch<InviteTokens>(`/api/rooms/${roomId}/invites`, { method: 'POST' })
      .then((result) => setTokens(result))
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('errors:network.inviteFailed')),
      )
      .finally(() => setLoading(false));
  }, [roomId, t]);

  async function copy(text: string, key: Exclude<CopiedKey, null>): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError(t('errors:network.copyFailed'));
    }
  }

  if (loading) {
    return (
      <div className={styles.inviteTabs}>
        <span className={styles.status}>{t('common:status.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.inviteTabs}>
        <p role="alert" className={styles.error}>{error}</p>
      </div>
    );
  }

  if (!tokens) return null;

  const isPlayer = activeTab === 'player';
  const activeCode = isPlayer ? `p_${tokens.playerToken}` : `o_${tokens.observerToken}`;
  const activeLink = isPlayer
    ? `${window.location.origin}/join/p_${tokens.playerToken}`
    : `${window.location.origin}/join/o_${tokens.observerToken}`;
  const codeCopyKey: Exclude<CopiedKey, null> = isPlayer ? 'player-code' : 'observer-code';
  const linkCopyKey: Exclude<CopiedKey, null> = isPlayer ? 'player-link' : 'observer-link';

  return (
    <div className={styles.inviteTabs}>
      <div className={styles.tabsRow} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isPlayer}
          className={[styles.tab, isPlayer ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('player')}
        >
          {t('room:invite.tabPlayer')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isPlayer}
          className={[styles.tab, !isPlayer ? styles.tabActive : ''].join(' ')}
          onClick={() => setActiveTab('observer')}
        >
          {t('room:invite.tabObserver')}
        </button>
      </div>

      <div className={styles.inviteRow}>
        <div className={styles.codePill}>
          <span className={styles.codePrefix}>{isPlayer ? 'p_' : 'o_'}</span>
          <span className={styles.codeVal}>
            {isPlayer ? tokens.playerToken : tokens.observerToken}
          </span>
        </div>

        <button
          type="button"
          className={styles.iconBtn}
          title={t('room:invite.copyLink')}
          aria-label={t('room:invite.copyLink')}
          onClick={() => void copy(activeLink, linkCopyKey)}
        >
          {copied === linkCopyKey ? (
            <Copy size={14} />
          ) : (
            <Link size={14} />
          )}
        </button>

        <button
          type="button"
          className={styles.btnCopy}
          onClick={() => void copy(activeCode, codeCopyKey)}
        >
          <Copy size={14} />
          {copied === codeCopyKey ? t('room:invite.copied') : t('room:invite.copyCode')}
        </button>
      </div>
    </div>
  );
}
