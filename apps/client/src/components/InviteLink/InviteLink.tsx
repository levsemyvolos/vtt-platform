import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Link } from 'lucide-react';
import { apiFetch } from '../../api/apiFetch';
import { useAppDispatch } from '../../store';
import { addToast } from '../../store/toast';
import { Button, Tabs, type TabItem } from '../ui';
import styles from './InviteLink.module.css';

interface InviteTokens {
  playerToken: string;
  observerToken: string;
}

type InviteAudience = 'player' | 'observer';

interface InviteLinkProps {
  roomId: string;
}

interface InvitePanelProps {
  tokens: InviteTokens;
  onCopy: (text: string) => void;
}

const TAB_ITEMS: ReadonlyArray<TabItem<InviteAudience>> = [
  { id: 'player', label: 'Player' },
  { id: 'observer', label: 'Observer' },
];

function InvitePanel({ tokens, onCopy }: InvitePanelProps): JSX.Element {
  const { t } = useTranslation(['room']);
  const [activeTab, setActiveTab] = useState<InviteAudience>('player');
  const isPlayer = activeTab === 'player';
  const prefix = isPlayer ? 'p_' : 'o_';
  const rawToken = isPlayer ? tokens.playerToken : tokens.observerToken;
  const activeCode = `${prefix}${rawToken}`;
  const activeLink = `${window.location.origin}/join/${activeCode}`;
  const items = TAB_ITEMS.map((item) => ({
    ...item,
    label: t(item.id === 'player' ? 'room:invite.tabPlayer' : 'room:invite.tabObserver'),
  }));

  return (
    <section className={`glass glass-strong ${styles.invitePanel}`}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>{t('room:invite.inviteBtn')}</div>
          <h2 className={styles.title}>{t('room:invite.shareLinkSecondary')}</h2>
        </div>
        <Tabs<InviteAudience>
          variant="segmented"
          items={items}
          value={activeTab}
          onChange={setActiveTab}
          ariaLabel={t('room:invite.inviteBtnTitle')}
          className={styles.tabs as string}
        />
      </div>

      <div className={styles.inviteRow}>
        <div className={styles.codePill}>
          <span className={styles.codePrefix}>{prefix}</span>
          <span className={styles.codeVal}>{rawToken}</span>
        </div>

        <Button
          type="button"
          variant="ghost"
          leftIcon={<Link size={16} strokeWidth={2} />}
          title={t('room:invite.copyLink')}
          aria-label={t('room:invite.copyLink')}
          onClick={() => onCopy(activeLink)}
        >
          {t('room:invite.copyLink')}
        </Button>

        <Button
          type="button"
          variant="secondary"
          leftIcon={<Copy size={16} strokeWidth={2} />}
          onClick={() => onCopy(activeCode)}
        >
          {t('room:invite.copyCode')}
        </Button>
      </div>
    </section>
  );
}

export default function InviteLink({ roomId }: InviteLinkProps): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const [tokens, setTokens] = useState<InviteTokens | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    apiFetch<InviteTokens>(`/api/rooms/${roomId}/invites`, { method: 'POST' })
      .then((result) => setTokens(result))
      .catch((err) =>
        setError(err instanceof Error ? err.message : t('errors:network.inviteFailed')),
      )
      .finally(() => setLoading(false));
  }, [roomId, t]);

  const handleCopy = (text: string): void => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        dispatch(addToast('success', t('room:invite.copied')));
      })
      .catch(() => setError(t('errors:network.copyFailed')));
  };

  if (loading) {
    return (
      <div className={`glass glass-strong ${styles.invitePanel}`}>
        <span className={styles.status}>{t('common:status.loading')}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`glass glass-strong ${styles.invitePanel}`}>
        <p role="alert" className={styles.error}>{error}</p>
      </div>
    );
  }

  if (!tokens) return null;

  return <InvitePanel tokens={tokens} onCopy={handleCopy} />;
}
