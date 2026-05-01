import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import InitiativeTracker from './InitiativeTracker';
import HandoutPanel from '../Handouts/HandoutPanel';
import NotesPanel from '../Notes/NotesPanel';
import CharacterSheet from '../CharacterSheet/CharacterSheet';
import AudioPanel from '../AudioPanel/AudioPanel';
import AudioPlayer from '../AudioPanel/AudioPlayer';
import VideoCall from '../VideoCall/VideoCall';
import AssistantPanel from '../AssistantPanel/AssistantPanel';
import styles from './Sidebar.module.css';

interface SidebarProps {
  roomId: string;
  sceneId: string | null;
  myRole: Role;
  myCharacterId: string | null;
  myUserId: string;
}

type Tab = 'initiative' | 'handouts' | 'notes' | 'character' | 'audio';

interface TabSpec {
  id: Tab;
  label: string;
}

function buildTabs(myRole: Role, t: (key: string) => string): TabSpec[] {
  const tabs: TabSpec[] = [{ id: 'initiative', label: t('campaign:initiative.sidebarTab') }];
  if (myRole !== 'Observer') tabs.push({ id: 'handouts', label: t('campaign:handouts.sidebarTab') });
  if (myRole === 'GM') tabs.push({ id: 'notes', label: t('campaign:notes.sidebarTab') });
  if (myRole !== 'Observer') tabs.push({ id: 'character', label: t('campaign:character.sidebarTab') });
  tabs.push({ id: 'audio', label: t('campaign:audio.sidebarTab') });
  return tabs;
}

interface PanelProps extends SidebarProps { tab: Tab; }

function ActivePanel({ tab, roomId, sceneId, myRole, myCharacterId }: PanelProps): JSX.Element | null {
  const { t } = useTranslation('campaign');
  if (tab === 'initiative') {
    return sceneId ? (
      <InitiativeTracker sceneId={sceneId} myRole={myRole} roomId={roomId} />
    ) : (
      <p className={styles.placeholder}>{t('sidebar.noActiveScene')}</p>
    );
  }
  if (tab === 'handouts') return <HandoutPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'notes') return <NotesPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'character') return <CharacterSheet characterId={myCharacterId ?? null} roomId={roomId} myRole={myRole} />;
  if (tab === 'audio') return <AudioPanel roomId={roomId} sceneId={sceneId} myRole={myRole} />;
  return null;
}

/**
 * Game-room sidebar (рис. 2.12, §2.10). Side-effect children mounted
 * unconditionally so playback / video survive tab switches.
 */
export default function Sidebar(props: SidebarProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const tabs = buildTabs(props.myRole, t);
  const [tab, setTab] = useState<Tab>('initiative');
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <aside className={styles.sidebar} aria-label={t('sidebar.ariaLabel')}>
      <VideoCall roomId={props.roomId} myUserId={props.myUserId} />
      <nav className={styles.tabs} role="tablist">
        {tabs.map((tabSpec) => (
          <button
            key={tabSpec.id}
            type="button"
            role="tab"
            aria-selected={tab === tabSpec.id}
            onClick={() => setTab(tabSpec.id)}
          >
            {tabSpec.label}
          </button>
        ))}
        {props.myRole === 'GM' && (
          <button
            type="button"
            className={styles.aiBtn}
            onClick={() => setAssistantOpen(true)}
            title={t('sidebar.aiBtn')}
            aria-label={t('sidebar.aiBtn')}
          >
            AI
          </button>
        )}
      </nav>
      <div className={styles.panel} role="tabpanel">
        <ActivePanel {...props} tab={tab} />
      </div>
      {assistantOpen && (
        <AssistantPanel roomId={props.roomId} onClose={() => setAssistantOpen(false)} />
      )}
      <AudioPlayer />
    </aside>
  );
}
