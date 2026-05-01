import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { clearRoom } from '../../store/room';
import { hydrateScene } from '../../store/scene';
import { hydrateChat } from '../../store/chat';
import { hydrateInitiative } from '../../store/initiative';
import { connectSocket, emitRoomJoin, emitSessionResync } from '../../api/socket';
import GameCanvas from '../../components/GameCanvas/GameCanvas';

function resolveHydrateError(err: unknown): string | null {
  const raw = err instanceof Error ? err.message : '';
  if (raw.includes('no active scene')) return null;
  return raw.startsWith('errors:') ? raw : 'errors:network.joinFailed';
}
import Sidebar from '../../components/Sidebar/Sidebar';
import ChatPanel from '../../components/ChatPanel/ChatPanel';
import DiceRoller from '../../components/DiceRoller/DiceRoller';
import styles from './GameRoom.module.css';

export default function GameRoom(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'errors']);
  const { currentRoom, members } = useAppSelector((s) => s.room);
  const { currentUser } = useAppSelector((s) => s.session);
  const scene = useAppSelector((s) => s.scene.current);
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

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

  if (!currentRoom) return null;

  const handleLeave = (): void => {
    dispatch(clearRoom());
  };

  return (
    <div className={styles.gameRoom}>
      <header className={styles.gameRoomHeader}>
        <button type="button" className={styles.btnBack} onClick={handleLeave}>
          {t('room:lobby.exitBtn')}
        </button>
        <h1>{currentRoom.name}</h1>
        <span className={styles.gameRoomRole}>
          {t('room:lobby.roleLabel')} {t(`room:roles.${myRole}`)}
        </span>
      </header>
      <div className={styles.gameRoomLayout}>
        <main className={styles.gameRoomCanvas}>
          {scene ? (
            <GameCanvas scene={scene} myRole={myRole} myUserId={currentUser?.id ?? ''} />
          ) : (
            <div className={styles.canvasPlaceholder}>
              {hydrating
                ? t('room:lobby.sessionLoading')
                : hydrateError
                  ? t('room:lobby.sessionError', { message: hydrateError })
                  : t('room:lobby.noActiveScene')}
            </div>
          )}
        </main>
        <section className={styles.gameRoomSide}>
          <Sidebar
            roomId={currentRoom.id}
            sceneId={scene?.id ?? null}
            myRole={myRole}
            myCharacterId={myMember?.characterId ?? null}
            myUserId={currentUser?.id ?? ''}
          />
          <DiceRoller roomId={currentRoom.id} />
          <ChatPanel roomId={currentRoom.id} />
        </section>
      </div>
    </div>
  );
}
