import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '../ui';
import type { TabItem } from '../ui';
import DialogList from './DialogList';
import ConversationView from './ConversationView';
import type { MainTab } from './ConversationView';
import RecentGenerations from './RecentGenerations';
import styles from './AssistantPanel.module.css';

interface AssistantPanelProps {
  roomId: string;
  onClose: () => void;
}

export default function AssistantPanel({ roomId, onClose }: AssistantPanelProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const [mainTab, setMainTab] = useState<MainTab>('llm');

  const tabs: ReadonlyArray<TabItem<MainTab>> = [
    { id: 'llm', label: t('tabs.llm') },
    { id: 'image', label: t('tabs.image') },
    { id: 'music', label: t('tabs.music') },
    { id: 'history', label: t('tabs.history') },
  ];

  return (
    <div className={styles.overlay} role="dialog" aria-label={t('header.title')}>
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.title}>{t('header.title')}</span>
          <span className={styles.subtitle}>{t('header.subtitle')}</span>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('panel.closeLabel')}
        >
          ✕
        </button>
      </div>
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
        <DialogList roomId={roomId} />
        <ConversationView roomId={roomId} mainTab={mainTab} />
        <RecentGenerations roomId={roomId} />
      </div>
    </div>
  );
}
