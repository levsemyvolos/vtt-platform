import { useEffect, useRef, useState } from 'react';
import type { RoomMemberDTO, TurnConfigResponse } from '@vtt/shared';
import styles from './VideoCall.module.css';
import { store, useAppDispatch, useAppSelector } from '../../store';
import {
  resetMedia,
  setLocalStreamReady,
  setMeshCeiling,
  toggleCamera as toggleCameraAction,
  toggleMic as toggleMicAction,
  upsertPeer,
  removePeer,
} from '../../store/media';
import VideoTile from '../VideoTile/VideoTile';
import VideoGrid from './VideoGrid';
import MeshCeilingBanner from './MeshCeilingBanner';
import { PeerManager } from '../../infrastructure/webrtc/PeerManager';
import { apiFetch } from '../../api/apiFetch';
import { connectSocket, emitRoomJoin, emitSignal, onSignal } from '../../api/socket';

/** Peer-connections ≥ this value → ceiling reached, video disabled for all. */
const MESH_CEILING = 6;

interface VideoCallProps {
  roomId: string;
  myUserId: string;
  members: RoomMemberDTO[];
}

export default function VideoCall({ roomId, myUserId, members }: VideoCallProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { micEnabled, cameraEnabled, localStreamReady, peers, meshCeilingReached } =
    useAppSelector((s) => s.media);

  const managerRef = useRef<PeerManager | null>(null);
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  const peerCount = Object.keys(peers).length;

  // Ceiling check — runs after each render where peerCount changed.
  useEffect(() => {
    const ceiling = peerCount >= MESH_CEILING;
    dispatch(setMeshCeiling(ceiling));
    if (ceiling) {
      managerRef.current?.setCameraEnabled(false);
    }
  }, [peerCount, dispatch]);

  // Main WebRTC bootstrap — runs once per roomId / myUserId.
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function fetchTurnConfig(): Promise<TurnConfigResponse> {
      return apiFetch<TurnConfigResponse>('/api/turn-config');
    }

    async function autoCallPeers(manager: PeerManager): Promise<void> {
      // members prop is populated by session:resync in GameRoom (parent effect).
      // Use lexicographic order so only the lower-ID peer sends the offer,
      // preventing double-offers between each pair.
      for (const member of members) {
        if (!cancelled && member.userId !== myUserId && myUserId < member.userId) {
          await manager.call(member.userId);
        }
      }
    }

    async function bootstrap(): Promise<void> {
      try {
        // ── 1. TURN credentials ──────────────────────────────────────────
        const cfg = await fetchTurnConfig();
        if (cancelled) return;

        // ── 2. Socket + room join ────────────────────────────────────────
        connectSocket();
        await emitRoomJoin(roomId);
        if (cancelled) return;

        // ── 3. PeerManager ───────────────────────────────────────────────
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
              // TURN refresh + retry on failure (credentials TTL 1 h per RFC 7635).
              if (state === 'failed' && !cancelled) {
                void (async () => {
                  try {
                    const refreshed = await fetchTurnConfig();
                    manager.setIceServers(refreshed.iceServers);
                    setTimeout(() => {
                      if (!cancelled) void manager.call(peerId);
                    }, 2000);
                  } catch {
                    // ignore — next manual reconnect will retry
                  }
                })();
              }
            },

            onPeerClosed: (peerId) => {
              delete remoteStreamsRef.current[peerId];
              dispatch(removePeer(peerId));
            },
          },
        });
        managerRef.current = manager;

        // ── 4. Local media (video disabled when already at ceiling) ──────
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
        setLocalStream(stream);
        dispatch(setLocalStreamReady(true));

        // ── 5. Signal listeners ──────────────────────────────────────────
        unsubscribe = onSignal(async (event, payload) => {
          if (payload.toUserId !== myUserId) return;
          await manager.handleSignal(event, payload);
        });

        // ── 6. Auto-call known members (alphabetical initiator convention)
        //       Prevents double-offers: only lower-ID peer sends the offer.
        await autoCallPeers(manager);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Не вдалося ввімкнути медіа');
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
      unsubscribe?.();
      managerRef.current?.closeAll();
      managerRef.current = null;
      dispatch(resetMedia());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- members intentionally excluded: handled by reactive effect below
  }, [roomId, myUserId, dispatch]);


  // Reactive peer calling: fires when members arrive from session:resync.
  // The main bootstrap effect runs before GameRoom's emitSessionResync completes,
  // so members is empty at that point. This effect retries once members are known.
  const calledRef = useRef(false);
  useEffect(() => {
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
  }, [members, myUserId]);

  function onToggleMic(): void {
    const next = !micEnabled;
    managerRef.current?.setMicEnabled(next);
    dispatch(toggleMicAction());
  }

  function onToggleCamera(): void {
    if (meshCeilingReached) return;
    const next = !cameraEnabled;
    managerRef.current?.setCameraEnabled(next);
    dispatch(toggleCameraAction());
  }

  const remoteList = Object.values(peers);
  const totalCount = 1 + remoteList.length;

  return (
    <section className={styles.videoCall} aria-label="Відео-чат сесії">
      {meshCeilingReached && <MeshCeilingBanner />}
      <VideoGrid count={totalCount}>
        <VideoTile label="Я" stream={localStream} muted />
        {remoteList.map((peer) => (
          <VideoTile
            key={peer.userId}
            label={peer.userId.slice(0, 8)}
            stream={remoteStreamsRef.current[peer.userId] ?? null}
            connectionState={peer.connectionState}
          />
        ))}
      </VideoGrid>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.btn}
          onClick={onToggleMic}
          disabled={!localStreamReady}
          aria-pressed={!micEnabled}
        >
          {micEnabled ? '🎙 Mute' : '🔇 Unmute'}
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={onToggleCamera}
          disabled={!localStreamReady || meshCeilingReached}
          aria-pressed={!cameraEnabled}
          title={meshCeilingReached ? 'Video disabled — mesh ceiling reached' : undefined}
        >
          {cameraEnabled && !meshCeilingReached ? '📷 Off' : '📸 On'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </section>
  );
}
