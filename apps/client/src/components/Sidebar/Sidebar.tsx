import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Dices,
  Swords,
  UserCircle,
  FileText,
  StickyNote,
  Headphones,
} from 'lucide-react';
import type { Role } from '@vtt/shared';
import type { SidebarTab } from '../GameRoom/types';
import InitiativeTracker from './InitiativeTracker';
import HandoutPanel from '../Handouts/HandoutPanel';
import NotesPanel from '../Notes/NotesPanel';
import CharacterSheet from '../CharacterSheet/CharacterSheet';
import AudioPanel from '../AudioPanel/AudioPanel';
import AudioPlayer from '../AudioPanel/AudioPlayer';
import ChatPanel from '../ChatPanel/ChatPanel';
import DiceRoller from '../DiceRoller/DiceRoller';
import styles from './Sidebar.module.css';

interface SidebarProps {
  roomId: string;
  sceneId: string | null;
  myRole: Role;
  myCharacterId: string | null;
  myUserId: string;
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
}

interface TabSpec {
  id: SidebarTab;
  icon: React.ReactNode;
  label: string;
  roleFilter?: (role: Role) => boolean;
}

const ICON_SIZE = 14;

function buildTabs(myRole: Role, t: (key: string) => string): TabSpec[] {
  const all: TabSpec[] = [
    {
      id: 'chat',
      icon: <MessageSquare size={ICON_SIZE} />,
      label: t('campaign:chat.sidebarTab'),
    },
    {
      id: 'dice',
      icon: <Dices size={ICON_SIZE} />,
      label: t('campaign:dice.sidebarTab'),
    },
    {
      id: 'initiative',
      icon: <Swords size={ICON_SIZE} />,
      label: t('campaign:initiative.sidebarTab'),
    },
    {
      id: 'character',
      icon: <UserCircle size={ICON_SIZE} />,
      label: t('campaign:character.sidebarTab'),
      roleFilter: (r) => r !== 'Observer',
    },
    {
      id: 'handouts',
      icon: <FileText size={ICON_SIZE} />,
      label: t('campaign:handouts.sidebarTab'),
      roleFilter: (r) => r !== 'Observer',
    },
    {
      id: 'notes',
      icon: <StickyNote size={ICON_SIZE} />,
      label: t('campaign:notes.sidebarTab'),
      roleFilter: (r) => r === 'GM',
    },
    {
      id: 'audio',
      icon: <Headphones size={ICON_SIZE} />,
      label: t('campaign:audio.sidebarTab'),
    },
  ];
  return all.filter((tab) => !tab.roleFilter || tab.roleFilter(myRole));
}

interface PanelProps {
  tab: SidebarTab;
  roomId: string;
  sceneId: string | null;
  myRole: Role;
  myCharacterId: string | null;
}

function ActivePanel({ tab, roomId, sceneId, myRole, myCharacterId }: PanelProps): JSX.Element | null {
  const { t } = useTranslation('campaign');
  if (tab === 'chat') return <ChatPanel roomId={roomId} />;
  if (tab === 'dice') return <DiceRoller roomId={roomId} />;
  if (tab === 'initiative') {
    return sceneId ? (
      <InitiativeTracker sceneId={sceneId} myRole={myRole} roomId={roomId} />
    ) : (
      <p className={styles.placeholder}>{t('sidebar.noActiveScene')}</p>
    );
  }
  if (tab === 'character') return <CharacterSheet characterId={myCharacterId ?? null} roomId={roomId} myRole={myRole} />;
  if (tab === 'handouts') return <HandoutPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'notes') return <NotesPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'audio') return <AudioPanel roomId={roomId} sceneId={sceneId} myRole={myRole} />;
  return null;
}

export default function Sidebar(props: SidebarProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const [internalTab, setInternalTab] = useState<SidebarTab>('initiative');
  const tab = props.activeTab ?? internalTab;
  const setTab = props.onTabChange ?? setInternalTab;

  const tabs = buildTabs(props.myRole, t as (key: string) => string);

  return (
    <aside
      className={styles.sidebar}
      aria-label={t('sidebar.ariaLabel')}
      style={{ gridArea: 'sidebar' }}
    >
      <nav className={styles.tabs} role="tablist">
        {tabs.map((tabSpec) => (
          <button
            key={tabSpec.id}
            type="button"
            role="tab"
            aria-selected={tab === tabSpec.id}
            className={`${styles.tabBtn}${tab === tabSpec.id ? ` ${styles.tabBtnActive}` : ''}`}
            onClick={() => setTab(tabSpec.id)}
            title={tabSpec.label}
            aria-label={tabSpec.label}
          >
            <span className={styles.tabIcon} aria-hidden>{tabSpec.icon}</span>
            <span className={styles.tabLabel}>{tabSpec.label}</span>
          </button>
        ))}
      </nav>
      <div className={styles.panel} role="tabpanel">
        <ActivePanel
          tab={tab}
          roomId={props.roomId}
          sceneId={props.sceneId}
          myRole={props.myRole}
          myCharacterId={props.myCharacterId}
        />
      </div>
      <AudioPlayer />
    </aside>
  );
}
