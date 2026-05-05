import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { hydrateScene, clearScene } from '../../store/scene';
import { hydrateChat } from '../../store/chat';
import { hydrateInitiative } from '../../store/initiative';
import { connectSocket, emitRoomJoin, emitSessionResync, getSocket } from '../../api/socket';
import { addToast } from '../../store/toast';
import GameCanvas from '../../components/GameCanvas/GameCanvas';
import Sidebar from '../../components/Sidebar/Sidebar';
import AssistantPanel from '../../components/AssistantPanel/AssistantPanel';
import { GameRoomTopBar, CanvasToolbar, PartyColumn, StatusBar } from '../../components/GameRoom';
import TurnRibbon from '../../components/GameRoom/TurnRibbon';
import FogControlsPopover from '../../components/GameRoom/FogControlsPopover';
import type { SidebarTab } from '../../components/GameRoom';
import styles from './GameRoom.module.css';

const TAB_KEY = 'vtt.sidebarActiveTab';
const COLLAPSED_KEY = 'vtt.sidebarCollapsed';
const WIDTH_KEY = 'vtt.sidebarWidth';
const SIDEBAR_DEFAULT_WIDTH = 380;
const SIDEBAR_COLLAPSED_WIDTH = 44;

function readSavedTab(): SidebarTab {
  const saved = localStorage.getItem(TAB_KEY);
  const valid: SidebarTab[] = ['chat', 'dice', 'initiative', 'character', 'handouts', 'notes', 'audio'];
  if (saved && (valid as string[]).includes(saved)) return saved as SidebarTab;
  return 'chat';
}

function resolveCanvasMsg(
  hydrating: boolean,
  hydrateError: string | null,
  loading: string,
  errTemplate: string,
  noScene: string,
): string {
  if (hydrating) return loading;
  if (hydrateError) return errTemplate.replace('{{message}}', hydrateError);
  return noScene;
}

function canShowFogControls(scene: import('@vtt/shared').SceneDTO | null, role: import('@vtt/shared').Role, tool: string): boolean {
  return scene !== null && role === 'GM' && tool === 'fog';
}

function resolveHydrateError(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : '';
  if (raw.includes('no active scene')) return null;
  return raw.startsWith('errors:') ? raw : 'errors:network.joinFailed';
}

export default function GameRoom(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'errors', 'gameroom']);
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const scene = useAppSelector((s) => s.scene.current);
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(readSavedTab);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const gameRoomRef = useRef<HTMLDivElement>(null);

  const roomId = currentRoom?.id;
  const myUserId = currentUser?.id ?? '';
  const myMember = members.find((m) => m.userId === myUserId);
  const myRole: Role = myMember?.role ?? 'Observer';
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setHydrating(true);
    setHydrateError(null);
    connectSocket();

    const doResync = async () => {
      try {
        const payload = await emitSessionResync(roomId);
        if (!cancelled) {
          dispatch(hydrateScene(payload.scene));
          dispatch(hydrateChat(payload.messages));
          dispatch(hydrateInitiative(payload.initiatives));
          setHydrateError(null);
        }
      } catch (err) {
        if (!cancelled) {
          dispatch(clearScene());
          const key = resolveHydrateError(err);
          setHydrateError(key ? t(key as never) : null);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    };

    (async () => {
      try {
        await emitRoomJoin(roomId);
        await doResync();
      } catch (err) {
        if (!cancelled) {
          dispatch(clearScene());
          const key = resolveHydrateError(err);
          setHydrateError(key ? t(key as never) : null);
          setHydrating(false);
        }
      }
    })();

    const s = getSocket();
    const handleSceneActivated = () => {
      if (!cancelled) {
        setHydrating(true);
        void doResync();
      }
    };
    s.on('scene:activated', handleSceneActivated);

    return () => {
      cancelled = true;
      s.off('scene:activated', handleSceneActivated);
    };
  }, [roomId, t, dispatch]);

  // One-time AI migration toast (§5.5)
  useEffect(() => {
    if (localStorage.getItem('vtt:ai-migration-seen') !== '1') {
      dispatch(addToast('info', t('gameroom:migration.aiMoved')));
      localStorage.setItem('vtt:ai-migration-seen', '1');
    }
  }, [dispatch, t]);

  // Restore sidebar width and collapsed state from localStorage on mount
  useEffect(() => {
    const savedW = Number(localStorage.getItem(WIDTH_KEY)) || SIDEBAR_DEFAULT_WIDTH;
    const savedC = localStorage.getItem(COLLAPSED_KEY) === '1';
    setSidebarWidth(savedW);
    setSidebarCollapsed(savedC);
  }, []);

  // Sync sidebar CSS var: 44px when collapsed (mini-strip), full width otherwise.
  useEffect(() => {
    const w = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;
    gameRoomRef.current?.style.setProperty('--sidebar-w', `${w}px`);
  }, [sidebarWidth, sidebarCollapsed]);

  // Persist active tab.
  useEffect(() => {
    localStorage.setItem(TAB_KEY, sidebarTab);
  }, [sidebarTab]);

  if (!currentRoom) return null;

  const canvasMsg = resolveCanvasMsg(
    hydrating,
    hydrateError,
    t('room:lobby.sessionLoading'),
    t('room:lobby.sessionError', { message: String(hydrateError) }),
    t('room:lobby.noActiveScene'),
  );

  function handleOpenTab(tab: SidebarTab): void {
    setSidebarTab(tab);
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      localStorage.setItem(COLLAPSED_KEY, '0');
    }
  }

  function handleOpenAssistant(): void {
    setAssistantOpen(true);
  }

  function handleToggleSidebar(): void {
    setSidebarCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  function handleSidebarTabChange(tab: SidebarTab): void {
    setSidebarTab(tab);
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      localStorage.setItem(COLLAPSED_KEY, '0');
    }
  }

  function handleSidebarResizeEnd(width: number): void {
    setSidebarWidth(width);
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      localStorage.setItem(COLLAPSED_KEY, '0');
    }
  }

  return (
    <div className={styles.gameRoom} ref={gameRoomRef}>
      <GameRoomTopBar
        myRole={myRole}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={handleToggleSidebar}
      />

      <PartyColumn
        roomId={currentRoom.id}
        myUserId={myUserId}
        myRole={myRole}
      />

      <main className={styles.canvas}>
        {scene ? (
          <GameCanvas
            scene={scene}
            myRole={myRole}
            myUserId={myUserId}
          />
        ) : (
          <div className={styles.canvasPlaceholder}>{canvasMsg}</div>
        )}
        <TurnRibbon />
        <CanvasToolbar
          myRole={myRole}
          onOpenTab={handleOpenTab}
          onOpenAssistant={handleOpenAssistant}
        />
        <StatusBar />
        {canShowFogControls(scene, myRole, activeTool) && (
          <FogControlsPopover roomId={currentRoom.id} />
        )}
      </main>

      <Sidebar
        roomId={currentRoom.id}
        sceneId={scene?.id ?? null}
        myRole={myRole}
        myCharacterId={myMember?.characterId ?? null}
        myUserId={myUserId}
        activeTab={sidebarTab}
        onTabChange={handleSidebarTabChange}
        containerRef={gameRoomRef}
        onResizeEnd={handleSidebarResizeEnd}
        collapsed={sidebarCollapsed}
      />

      {assistantOpen && (
        <AssistantPanel
          roomId={currentRoom.id}
          onClose={() => setAssistantOpen(false)}
        />
      )}
    </div>
  );
}
