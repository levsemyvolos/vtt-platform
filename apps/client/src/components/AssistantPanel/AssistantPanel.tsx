import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import Sigil from '../common/Sigil';
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
  const showWarning = rateLimitRemaining !== null && rateLimitRemaining <= 2;

  const tabs: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'llm', label: t('tabs.llm') },
    { id: 'image', label: t('tabs.image') },
    { id: 'music', label: t('tabs.music') },
    { id: 'history', label: t('tabs.history') },
  ];

  return (
    <div className={styles.overlay} role="dialog" aria-label={t('header.title')}>
      <header className={styles.header}>
        <div className={styles.headerMark} aria-hidden="true">
          <Sigil variant="compass" />
        </div>
        <div className={styles.headerInfo}>
          <span className={styles.headerEyebrow}>{t('header.eyebrow')}</span>
          <h1 className={styles.title}>{t('header.title')}</h1>
        </div>
        <span className={styles.subtitle}>{t('header.subtitle')}</span>
        {rateLimitRemaining !== null && (
          <span
            className={`${styles.rateLimitBadge} ${showWarning ? styles.rateLimitWarning : ''}`}
            title={t('header.rateLimit.tooltip')}
            aria-label={t('header.rateLimit.aria', { remaining: rateLimitRemaining })}
          >
            {t('header.rateLimit.label', { remaining: rateLimitRemaining })}
          </span>
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
          ariaLabel={t('header.title')}
        />
      </div>
      <div className={styles.body}>
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
        {(mainTab === 'llm' || mainTab === 'history') && (
          <>
            <DialogList roomId={roomId} />
            <ConversationView roomId={roomId} mainTab={mainTab} />
            <RecentGenerations roomId={roomId} />
          </>
        )}
      </div>
    </div>
  );
}
