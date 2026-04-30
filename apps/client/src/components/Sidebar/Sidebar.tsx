import { useState } from 'react';
import type { Role } from '@vtt/shared';
import InitiativeTracker from './InitiativeTracker';
import HandoutPanel from '../Handouts/HandoutPanel';
import NotesPanel from '../Notes/NotesPanel';
import CharacterSheet from '../CharacterSheet/CharacterSheet';
import AudioPanel from '../AudioPanel/AudioPanel';
import AudioPlayer from '../AudioPanel/AudioPlayer';
import VideoCall from '../VideoCall/VideoCall';

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

function buildTabs(myRole: Role, myCharacterId: string | null): TabSpec[] {
  const tabs: TabSpec[] = [{ id: 'initiative', label: 'Ініціатива' }];
  if (myRole !== 'Observer') tabs.push({ id: 'handouts', label: 'Handouts' });
  if (myRole === 'GM') tabs.push({ id: 'notes', label: 'Нотатки' });
  if (myCharacterId) tabs.push({ id: 'character', label: 'Персонаж' });
  tabs.push({ id: 'audio', label: 'Музика' });
  return tabs;
}

interface PanelProps extends SidebarProps {
  tab: Tab;
}

function ActivePanel({ tab, roomId, sceneId, myRole, myCharacterId }: PanelProps): JSX.Element | null {
  if (tab === 'initiative') {
    return sceneId ? (
      <InitiativeTracker sceneId={sceneId} myRole={myRole} />
    ) : (
      <p className="sidebar__placeholder">Сцена не активна.</p>
    );
  }
  if (tab === 'handouts') return <HandoutPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'notes') return <NotesPanel roomId={roomId} myRole={myRole} />;
  if (tab === 'character' && myCharacterId)
    return <CharacterSheet characterId={myCharacterId} myRole={myRole} />;
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
  const tabs = buildTabs(props.myRole, props.myCharacterId);
  const [tab, setTab] = useState<Tab>('initiative');
  return (
    <aside className="sidebar" aria-label="Room sidebar">
      <VideoCall roomId={props.roomId} myUserId={props.myUserId} />
      <nav className="sidebar__tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <div className="sidebar__panel" role="tabpanel">
        <ActivePanel {...props} tab={tab} />
      </div>
      <AudioPlayer />
    </aside>
  );
}
