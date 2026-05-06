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

interface InvitePanelProps {
  tokens: InviteTokens;
  copied: CopiedKey;
  onCopy: (text: string, key: Exclude<CopiedKey, null>) => void;
}

function InvitePanel({ tokens, copied, onCopy }: InvitePanelProps): JSX.Element {
  const { t } = useTranslation(['room']);
  const [activeTab, setActiveTab] = useState<'player' | 'observer'>('player');
  const isPlayer = activeTab === 'player';
  const prefix = isPlayer ? 'p_' : 'o_';
  const rawToken = isPlayer ? tokens.playerToken : tokens.observerToken;
  const activeCode = `${prefix}${rawToken}`;
  const activeLink = `${window.location.origin}/join/${activeCode}`;
  const codeCopyKey: Exclude<CopiedKey, null> = isPlayer ? 'player-code' : 'observer-code';
  const linkCopyKey: Exclude<CopiedKey, null> = isPlayer ? 'player-link' : 'observer-link';
  const linkJustCopied = copied === linkCopyKey;
  const codeJustCopied = copied === codeCopyKey;

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
          <span className={styles.codePrefix}>{prefix}</span>
          <span className={styles.codeVal}>{rawToken}</span>
        </div>

        <button
          type="button"
          className={styles.iconBtn}
          title={t('room:invite.copyLink')}
          aria-label={t('room:invite.copyLink')}
          onClick={() => onCopy(activeLink, linkCopyKey)}
        >
          {linkJustCopied ? <Copy size={14} /> : <Link size={14} />}
        </button>

        <button
          type="button"
          className={styles.btnCopy}
          onClick={() => onCopy(activeCode, codeCopyKey)}
        >
          <Copy size={14} />
          {codeJustCopied ? t('room:invite.copied') : t('room:invite.copyCode')}
        </button>
      </div>
    </div>
  );
}

export default function InviteLink({ roomId }: InviteLinkProps): JSX.Element | null {
  const { t } = useTranslation(['room', 'common', 'errors']);
  const [tokens, setTokens] = useState<InviteTokens | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopiedKey>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<InviteTokens>(`/api/rooms/${roomId}/invites`, { method: 'POST' })
      .then((result) => setTokens(result))
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('errors:network.inviteFailed')),
      )
      .finally(() => setLoading(false));
  }, [roomId, t]);

  const handleCopy = (text: string, key: Exclude<CopiedKey, null>): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(key);
        setTimeout(() => setCopied(null), 2000);
      })
      .catch(() => setError(t('errors:network.copyFailed')));
  };

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

  return <InvitePanel tokens={tokens} copied={copied} onCopy={handleCopy} />;
}
