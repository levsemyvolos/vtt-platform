import { useState, useRef, useEffect } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { MessagesSquare, Image as ImageIcon, Music } from 'lucide-react';
import { Tabs } from '../ui';
import type { TabItem } from '../ui';
import DialogList from './DialogList';
import ConversationView from './ConversationView';
import type { MainTab } from './ConversationView';
import ImageThreadList from './ImageThreadList';
import ImageThreadView from './ImageThreadView';
import MusicHistoryList from './MusicHistoryList';
import MusicPromptBuilder from './MusicPromptBuilder';
import RecentGenerations from './RecentGenerations';
import RateLimitMeter from './RateLimitMeter';
import SessionBadge from './SessionBadge';
import Logo from '../ui/Logo';
import { useAppSelector } from '../../store';
import styles from './AssistantPanel.module.css';

interface AssistantPanelProps {
  roomId: string;
  onClose: () => void;
}

export default function AssistantPanel({ roomId, onClose }: AssistantPanelProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [mainTab, setMainTab] = useState<MainTab>('llm');
  // Bumped on every successful music generation — drives MusicHistoryList refetch.
  const [musicGenCount, setMusicGenCount] = useState<number>(0);
  const rateLimitRemaining = useAppSelector((s) => s.assistant.rateLimitRemaining);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem('vtt.assistantDialogListWidth');
    if (stored && bodyRef.current) {
      bodyRef.current.style.setProperty('--dialog-list-w', `${stored}px`);
    }
  }, []);

  const counselCount = useAppSelector((s) =>
    Object.values(s.assistant.conversations).filter((c) => c.roomId === roomId).length,
  );
  const sceneryCount = useAppSelector((s) =>
    Object.values(s.imageAssistant.conversations).filter((c) => c.roomId === roomId).length,
  );

  const tabs: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'llm',     label: t('tabs.llm'),     icon: <MessagesSquare size={14} />, ...(counselCount > 0 ? { count: counselCount } : {}) },
    { id: 'image',   label: t('tabs.image'),   icon: <ImageIcon size={14} />,      ...(sceneryCount > 0 ? { count: sceneryCount } : {}) },
    { id: 'music',   label: t('tabs.music'),   icon: <Music size={14} /> },
  ];

  return (
    <div className={styles.overlay} role="dialog" aria-label={t('panel.dialogLabel')}>
      <header className={styles.header}>
        <div className={styles.headerMark} aria-hidden="true">
          <Logo size={22} withText={false} />
        </div>
        <div className={styles.headerInfo}>
          <span className={styles.headerEyebrow}>{t('header.eyebrow')}</span>
          <h1 className={styles.title}>
            <Trans i18nKey="header.title" ns="assistant" components={{ em: <em /> }} />
          </h1>
        </div>
        <span className={styles.subtitle}>{t('header.subtitle')}</span>
        <SessionBadge />
        {rateLimitRemaining !== null && (
          <RateLimitMeter remaining={rateLimitRemaining} />
        )}
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('panel.closeLabel')}
        >
          ✕
        </button>
      </header>
      <div className={styles.tabsBar}>
        <Tabs
          variant="pill"
          items={tabs}
          value={mainTab}
          onChange={setMainTab}
          ariaLabel={t('panel.title')}
        />
      </div>
      <div className={styles.body} ref={bodyRef}>
        {mainTab === 'image' && (
          <>
            <ImageThreadList roomId={roomId} />
            <ImageThreadView roomId={roomId} />
            <RecentGenerations roomId={roomId} />
          </>
        )}
        {mainTab === 'music' && (
          <>
            <MusicHistoryList roomId={roomId} refreshTrigger={musicGenCount} />
            <MusicPromptBuilder roomId={roomId} onGenerated={() => setMusicGenCount((n) => n + 1)} />
            <RecentGenerations roomId={roomId} />
          </>
        )}
        {mainTab === 'llm' && (
          <>
            <DialogList roomId={roomId} containerRef={bodyRef} />
            <ConversationView roomId={roomId} mainTab={mainTab} />
            <RecentGenerations roomId={roomId} />
          </>
        )}
      </div>
    </div>
  );
}
