import { type CSSProperties, type RefObject, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Swords,
  UserCircle,
  BookOpen,
  Headphones,
} from 'lucide-react';
import type { Role } from '@vtt/shared';
import type { SidebarTab } from '../GameRoom/types';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearTab } from '../../store/notifications';
import InitiativeTracker from './InitiativeTracker';
import CharacterStatStrip from '../CharacterSheet/CharacterStatStrip';
import AudioPanel from '../AudioPanel/AudioPanel';
import AudioPlayer from '../AudioPanel/AudioPlayer';
import ChatPanel from '../ChatPanel/ChatPanel';
import JournalPanel from '../Journal/JournalPanel';
import SidebarResizer from '../GameRoom/SidebarResizer';
import styles from './Sidebar.module.css';

interface SidebarProps {
  roomId: string;
  sceneId: string | null;
  myRole: Role;
  myCharacterId: string | null;
  myUserId: string;
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
  containerRef: RefObject<HTMLDivElement>;
  onResizeEnd: (width: number) => void;
  collapsed?: boolean;
  style?: CSSProperties;
  /** T2 will wire this to the StatStrip "Open Sheet" button. */
  onOpenCharacterSheet?: (characterId: string | null) => void;
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
      id: 'journal',
      icon: <BookOpen size={ICON_SIZE} />,
      label: t('campaign:journal.sidebarTab'),
      roleFilter: (r) => r !== 'Observer',
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
  myUserId: string;
  onOpenCharacterSheet?: (characterId: string | null) => void;
}

function InitiativePanel({ sceneId, myRole, roomId }: { sceneId: string | null; myRole: Role; roomId: string }): JSX.Element {
  const { t } = useTranslation('campaign');
  if (sceneId) return <InitiativeTracker sceneId={sceneId} myRole={myRole} roomId={roomId} />;
  return <p className={styles.placeholder}>{t('sidebar.noActiveScene')}</p>;
}

function ActivePanel({ tab, roomId, sceneId, myRole, myCharacterId, myUserId, onOpenCharacterSheet }: PanelProps): JSX.Element | null {
  if (tab === 'chat') return <ChatPanel roomId={roomId} />;
  if (tab === 'initiative') return <InitiativePanel sceneId={sceneId} myRole={myRole} roomId={roomId} />;
  if (tab === 'character') {
    return (
      <CharacterStatStrip
        roomId={roomId}
        myRole={myRole}
        myCharacterId={myCharacterId ?? null}
        onOpenSheet={onOpenCharacterSheet ?? (() => { /* no-op */ })}
      />
    );
  }
  if (tab === 'journal') return <JournalPanel roomId={roomId} myRole={myRole} myUserId={myUserId} />;
  if (tab === 'audio') return <AudioPanel roomId={roomId} sceneId={sceneId} myRole={myRole} />;
  return null;
}

export default function Sidebar(props: SidebarProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const [internalTab, setInternalTab] = useState<SidebarTab>('chat');
  const tab = props.activeTab ?? internalTab;
  const setTab = props.onTabChange ?? setInternalTab;
  const collapsed = props.collapsed ?? false;

  const dispatch = useAppDispatch();
  const unreadByTab = useAppSelector((s) => s.notifications.unreadByTab);

  const tabs = buildTabs(props.myRole, t as (key: string) => string);

  return (
    <aside
      className={`${styles.sidebar}${collapsed ? ` ${styles.sidebarCollapsed}` : ''}`}
      aria-label={t('sidebar.ariaLabel')}
      style={{ gridArea: 'sidebar', ...props.style }}
      data-collapsed={collapsed ? 'true' : undefined}
    >
      {!collapsed && (
        <SidebarResizer containerRef={props.containerRef} onResizeEnd={props.onResizeEnd} />
      )}
      <nav className={styles.tabs} role="tablist">
        {tabs.map((tabSpec) => (
          <button
            key={tabSpec.id}
            type="button"
            role="tab"
            aria-selected={tab === tabSpec.id}
            className={`${styles.tabBtn}${tab === tabSpec.id ? ` ${styles.tabBtnActive}` : ''}`}
            onClick={() => {
              dispatch(clearTab(tabSpec.id));
              setTab(tabSpec.id);
            }}
            title={tabSpec.label}
            aria-label={tabSpec.label}
          >
            <span className={styles.tabIcon} aria-hidden>{tabSpec.icon}</span>
            <span className={styles.tabLabel}>{tabSpec.label}</span>
            {(unreadByTab[tabSpec.id] ?? 0) > 0 ? (
              <span
                className={styles.tabBadge}
                aria-label={`${unreadByTab[tabSpec.id]} unread`}
              >
                {(unreadByTab[tabSpec.id] ?? 0) > 9 ? '9+' : unreadByTab[tabSpec.id]}
              </span>
            ) : null}
          </button>
        ))}
      </nav>
      {!collapsed && (
        <>
          <div className={styles.panel} role="tabpanel">
            <ActivePanel
              tab={tab}
              roomId={props.roomId}
              sceneId={props.sceneId}
              myRole={props.myRole}
              myCharacterId={props.myCharacterId}
              myUserId={props.myUserId}
              {...(props.onOpenCharacterSheet
                ? { onOpenCharacterSheet: props.onOpenCharacterSheet }
                : {})}
            />
          </div>
          <AudioPlayer />
        </>
      )}
    </aside>
  );
}
