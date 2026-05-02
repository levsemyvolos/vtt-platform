import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { hydrateScene } from '../../store/scene';
import { hydrateChat } from '../../store/chat';
import { hydrateInitiative } from '../../store/initiative';
import { connectSocket, emitRoomJoin, emitSessionResync } from '../../api/socket';
import { addToast } from '../../store/toast';
import GameCanvas from '../../components/GameCanvas/GameCanvas';
import Sidebar from '../../components/Sidebar/Sidebar';
import AssistantPanel from '../../components/AssistantPanel/AssistantPanel';
import { GameRoomTopBar, CanvasToolbar, PartyColumn, StatusBar } from '../../components/GameRoom';
import type { SidebarTab } from '../../components/GameRoom';
import styles from './GameRoom.module.css';

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
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('initiative');
  const [assistantOpen, setAssistantOpen] = useState(false);

  const roomId = currentRoom?.id;
  const myMember = members.find((m) => m.userId === currentUser?.id);
  const myRole: Role = myMember?.role ?? 'Observer';

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    setHydrating(true);
    setHydrateError(null);
    connectSocket();
    (async () => {
      try {
        await emitRoomJoin(roomId);
        const payload = await emitSessionResync(roomId);
        if (!cancelled) {
          dispatch(hydrateScene(payload.scene));
          dispatch(hydrateChat(payload.messages));
          dispatch(hydrateInitiative(payload.initiatives));
        }
      } catch (err) {
        if (!cancelled) {
          const key = resolveHydrateError(err);
          setHydrateError(key ? t(key as never) : null);
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, t, dispatch]);

  // One-time AI migration toast (§5.5)
  useEffect(() => {
    if (localStorage.getItem('vtt:ai-migration-seen') !== '1') {
      dispatch(addToast('info', t('gameroom:migration.aiMoved')));
      localStorage.setItem('vtt:ai-migration-seen', '1');
    }
  }, [dispatch, t]);

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
  }

  function handleOpenAssistant(): void {
    setAssistantOpen(true);
  }

  return (
    <div className={styles.gameRoom}>
      <GameRoomTopBar myRole={myRole} />
      <CanvasToolbar
        myRole={myRole}
        onOpenTab={handleOpenTab}
        onOpenAssistant={handleOpenAssistant}
      />

      <PartyColumn roomId={currentRoom.id} myUserId={currentUser?.id ?? ''} />

      <main className={styles.canvas}>
        {scene ? (
          <GameCanvas
            scene={scene}
            myRole={myRole}
            myUserId={currentUser?.id ?? ''}
          />
        ) : (
          <div className={styles.canvasPlaceholder}>{canvasMsg}</div>
        )}
      </main>

      <Sidebar
        roomId={currentRoom.id}
        sceneId={scene?.id ?? null}
        myRole={myRole}
        myCharacterId={myMember?.characterId ?? null}
        myUserId={currentUser?.id ?? ''}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
      />

      <StatusBar />

      {assistantOpen && (
        <AssistantPanel
          roomId={currentRoom.id}
          onClose={() => setAssistantOpen(false)}
        />
      )}
    </div>
  );
}
