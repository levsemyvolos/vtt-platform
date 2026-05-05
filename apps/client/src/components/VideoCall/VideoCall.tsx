import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import type { RoomMemberDTO, TurnConfigResponse } from '@vtt/shared';
import styles from './VideoCall.module.css';
import { store, useAppDispatch, useAppSelector } from '../../store';
import {
  resetMedia,
  setCallJoined,
  setLocalStreamReady,
  setMeshCeiling,
  upsertPeer,
  removePeer,
} from '../../store/media';
import { addToast } from '../../store/toast';
import VideoTile from '../VideoTile/VideoTile';
import MeshCeilingBanner from './MeshCeilingBanner';
import { PeerManager } from '../../infrastructure/webrtc/PeerManager';
import { peerManagerRef } from '../../infrastructure/webrtc/peerManagerRef';
import { apiFetch } from '../../api/apiFetch';
import { connectSocket, emitRoomJoin, emitSignal, onSignal } from '../../api/socket';

const MESH_CEILING = 6;

interface VideoCallProps {
  roomId: string;
  myUserId: string;
  members: RoomMemberDTO[];
}

export default function VideoCall({ roomId, myUserId, members }: VideoCallProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('gameroom');
  const { localStreamReady, callJoined, peers } = useAppSelector((s) => s.media);

  const managerRef = useRef<PeerManager | null>(null);
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const knownMembersRef = useRef<RoomMemberDTO[]>(members);

  useEffect(() => {
    knownMembersRef.current = members;
  }, [members]);

  const peerCount = Object.keys(peers).length;

  useEffect(() => {
    const ceiling = peerCount >= MESH_CEILING;
    dispatch(setMeshCeiling(ceiling));
    if (ceiling) {
      managerRef.current?.setCameraEnabled(false);
    }
  }, [peerCount, dispatch]);

  // Main WebRTC bootstrap — runs only after explicit Connect click (callJoined).
  useEffect(() => {
    if (!callJoined) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function fetchTurnConfig(): Promise<TurnConfigResponse> {
      return apiFetch<TurnConfigResponse>('/api/turn-config');
    }

    async function autoCallPeers(manager: PeerManager): Promise<void> {
      const list = knownMembersRef.current;
      for (const member of list) {
        if (!cancelled && member.userId !== myUserId && myUserId < member.userId) {
          await manager.call(member.userId);
        }
      }
    }

    async function bootstrap(): Promise<void> {
      try {
        const cfg = await fetchTurnConfig();
        if (cancelled) return;

        connectSocket();
        await emitRoomJoin(roomId);
        if (cancelled) return;

        const manager = new PeerManager({
          selfUserId: myUserId,
          roomId,
          iceServers: cfg.iceServers,
          callbacks: {
            sendSignal: (event, payload) => emitSignal(event, payload),

            onRemoteStream: (peerId, stream) => {
              remoteStreamsRef.current[peerId] = stream;
              dispatch(
                upsertPeer({ userId: peerId, hasStream: true, connectionState: 'connected' }),
              );
            },

            onConnectionStateChange: (peerId, state) => {
              dispatch(
                upsertPeer({
                  userId: peerId,
                  hasStream: Boolean(remoteStreamsRef.current[peerId]),
                  connectionState: state,
                }),
              );
              if (state === 'failed' && !cancelled) {
                void (async () => {
                  try {
                    const refreshed = await fetchTurnConfig();
                    manager.setIceServers(refreshed.iceServers);
                    setTimeout(() => {
                      if (!cancelled) void manager.call(peerId);
                    }, 2000);
                  } catch {
                    // ignore — manual reconnect will retry
                  }
                })();
              }
            },

            onPeerClosed: (peerId) => {
              delete remoteStreamsRef.current[peerId];
              dispatch(removePeer(peerId));
            },

            onNegotiationError: (peerId) => {
              // Common after Reconnect — RTP extension IDs mismatch on stale PC.
              // Peer already closed by PeerManager; surface to user, suggest reload.
              dispatch(addToast('error', t('videoCall.negotiationError', { peer: peerId.slice(0, 8) })));
            },
          },
        });
        managerRef.current = manager;
        peerManagerRef.current = manager;

        const alreadyAtCeiling =
          Object.keys(store.getState().media.peers).length >= MESH_CEILING;
        const stream = await manager.startLocalMedia({
          audio: true,
          video: !alreadyAtCeiling,
        });
        if (cancelled) {
          manager.closeAll();
          return;
        }
        // Mute mic and camera by default — user opts in via Mic/Cam buttons in MediaControls.
        manager.setMicEnabled(false);
        manager.setCameraEnabled(false);
        setLocalStream(stream);
        dispatch(setLocalStreamReady(true));

        unsubscribe = onSignal(async (event, payload) => {
          if (payload.toUserId !== myUserId) return;
          await manager.handleSignal(event, payload);
        });

        await autoCallPeers(manager);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не вдалося ввімкнути медіа');
          dispatch(setCallJoined(false));
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      unsubscribe?.();
      managerRef.current?.closeAll();
      managerRef.current = null;
      peerManagerRef.current = null;
      dispatch(resetMedia());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUserId, dispatch, callJoined]);


  // Reactive peer calling: fires when members arrive from session:resync after bootstrap.
  const calledRef = useRef(false);
  useEffect(() => {
    if (!callJoined) {
      calledRef.current = false;
      return;
    }
    if (calledRef.current) return;
    if (!managerRef.current) return;
    if (members.length === 0) return;
    calledRef.current = true;
    const manager = managerRef.current;
    void (async () => {
      for (const member of members) {
        if (member.userId !== myUserId && myUserId < member.userId) {
          await manager.call(member.userId);
        }
      }
    })();
  }, [members, myUserId, callJoined]);

  function onJoinCall(): void {
    setError(null);
    dispatch(setCallJoined(true));
  }

  // Pre-join: only show Connect placeholder.
  if (!callJoined) {
    return (
      <section className={styles.videoCall} aria-label={t('videoCall.aria')}>
        <div className={styles.joinPlaceholder}>
          <Phone size={28} aria-hidden />
          <p className={styles.joinPrompt}>{t('videoCall.joinPrompt')}</p>
          <button type="button" className={styles.joinBtn} onClick={onJoinCall}>
            {t('videoCall.joinBtn')}
          </button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </section>
    );
  }

  const remoteList = Object.values(peers);

  return (
    <section className={styles.videoCall} aria-label={t('videoCall.aria')}>
      {/* Banner is non-blocking; keep above the cam list */}
      <div className={styles.cams}>
        <VideoTile label={t('videoCall.selfLabel')} stream={localStream} muted />
        {remoteList.map((peer) => (
          <VideoTile
            key={peer.userId}
            label={peer.userId.slice(0, 8)}
            stream={remoteStreamsRef.current[peer.userId] ?? null}
            connectionState={peer.connectionState}
          />
        ))}
      </div>
      {!localStreamReady && error && <p className={styles.error}>{error}</p>}
      <MeshCeilingBannerWrapper />
    </section>
  );
}

function MeshCeilingBannerWrapper(): JSX.Element | null {
  const meshCeilingReached = useAppSelector((s) => s.media.meshCeilingReached);
  if (!meshCeilingReached) return null;
  return <MeshCeilingBanner />;
}
