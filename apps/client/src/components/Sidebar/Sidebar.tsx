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

interface PanelProps extends SidebarProps {
  tab: Tab;
}

function ActivePanel({ tab, roomId, sceneId, myRole, myCharacterId }: PanelProps): JSX.Element | null {
  const { t } = useTranslation('campaign');
  if (tab === 'initiative') {
    return sceneId ? (
      <InitiativeTracker sceneId={sceneId} myRole={myRole} roomId={roomId} />
    ) : (
      <p className="sidebar__placeholder">{t('sidebar.noActiveScene')}</p>
    );
  }
  if (tab === 'handouts') return <HandoutPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'notes') return <NotesPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'character')
    return <CharacterSheet characterId={myCharacterId ?? null} roomId={roomId} myRole={myRole} />;
  if (tab === 'audio') return <AudioPanel roomId={roomId} sceneId={sceneId} myRole={myRole} />;
  return null;
}

/**
 * Game-room sidebar (рис. 2.12, §2.10). Слоти: Initiative (Ф7.3), Handouts
 * (Ф7.4), Notes (Ф9 GM-only), Character (Ф7.5), Audio (Ф6).
 *
 * Side-effect children mounted unconditionally so playback / video survive
 * tab switches:
 *  - `<AudioPlayer />` — headless `<audio>` driven by `audio:play` events.
 *  - `<VideoCall />`   — `<video>` montage of local + remote WebRTC peers.
 */
export default function Sidebar(props: SidebarProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const tabs = buildTabs(props.myRole, t);
  const [tab, setTab] = useState<Tab>('initiative');
  const [assistantOpen, setAssistantOpen] = useState(false);

  return (
    <aside className="sidebar" aria-label={t('sidebar.ariaLabel')}>
      <VideoCall roomId={props.roomId} myUserId={props.myUserId} />
      <nav className="sidebar__tabs" role="tablist">
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
            className="sidebar__ai-btn"
            onClick={() => setAssistantOpen(true)}
            title={t('sidebar.aiBtn')}
          >
            AI
          </button>
        )}
      </nav>
      <div className="sidebar__panel" role="tabpanel">
        <ActivePanel {...props} tab={tab} />
      </div>
      {assistantOpen && (
        <AssistantPanel roomId={props.roomId} onClose={() => setAssistantOpen(false)} />
      )}
      <AudioPlayer />
    </aside>
  );
}
