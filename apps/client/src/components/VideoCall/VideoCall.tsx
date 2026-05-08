import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Phone } from 'lucide-react';
import type { RoomMemberDTO, TurnConfigResponse } from '@vtt/shared';
import { Button } from '../ui';
import styles from './VideoCall.module.css';
import { store, useAppDispatch, useAppSelector } from '../../store';
import {
  resetMedia,
  setCallJoined,
  setLocalStreamReady,
  setMeshCeiling,
  upsertPeer,
  removePeer,
  reorderPeers,
  setPeerRtt,
  setSpeaking,
} from '../../store/media';
import { SpeakingDetector } from '../../infrastructure/webrtc/SpeakingDetector';
import { useDragReorder } from '../../hooks/useDragReorder';
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
  const { localStreamReady, callJoined, peers, peerOrder, pinnedPeerIds, speakingPeerIds } = useAppSelector((s) => s.media);

  const managerRef = useRef<PeerManager | null>(null);
  const detectorRef = useRef<SpeakingDetector | null>(null);
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const knownMembersRef = useRef<RoomMemberDTO[]>(members);
  // Tracks every peer we've already invoked manager.call() on. Shared by
  // bootstrap's initial autoCallPeers AND the reactive members-change effect,
  // so newcomers (3rd+ participant) get dialed exactly once each.
  const calledPeersRef = useRef<Set<string>>(new Set());

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
    let credRefreshTimer: ReturnType<typeof setInterval> | null = null;

    async function fetchTurnConfig(): Promise<TurnConfigResponse> {
      return apiFetch<TurnConfigResponse>('/api/turn-config');
    }

    function autoCallPeers(manager: PeerManager): void {
      const list = knownMembersRef.current;
      for (const member of list) {
        if (cancelled || member.userId === myUserId) continue;
        if (calledPeersRef.current.has(member.userId)) continue;
        if (myUserId < member.userId) {
          calledPeersRef.current.add(member.userId);
          manager.call(member.userId);
        }
      }
    }

    async function bootstrap(): Promise<void> {
      try {
        const cfg = await fetchTurnConfig();
        if (cancelled) return;

        // Proactively refresh TURN credentials at 75% of TTL to survive long sessions.
        const refreshMs = cfg.ttlSecondsRemaining * 0.75 * 1000;
        credRefreshTimer = setInterval(async () => {
          if (cancelled) return;
          try {
            const fresh = await fetchTurnConfig();
            managerRef.current?.setIceServers(fresh.iceServers);
          } catch { /* ignore; reactive refresh on failure still exists */ }
        }, refreshMs);

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
              detectorRef.current?.attach(peerId, stream);
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
                // ICE restart + two-stage recovery is handled inside PeerManager;
                // refresh TURN credentials in case the previous set expired.
                void (async () => {
                  if (cancelled) return;
                  try {
                    const refreshed = await fetchTurnConfig();
                    if (cancelled) return;
                    manager.setIceServers(refreshed.iceServers);
                  } catch {
                    // ignore — proactive timer or manual reconnect will retry
                  }
                })();
              }
            },

            onPeerClosed: (peerId) => {
              delete remoteStreamsRef.current[peerId];
              dispatch(removePeer(peerId));
              detectorRef.current?.detach(peerId);
            },

            onNegotiationError: (peerId) => {
              dispatch(addToast('error', t('videoCall.negotiationError', { peer: peerId.slice(0, 8) })));
            },

            onRttUpdate: (peerId, rttMs) => {
              dispatch(setPeerRtt({ userId: peerId, rttMs }));
            },
          },
        });
        managerRef.current = manager;
        peerManagerRef.current = manager;
        detectorRef.current = new SpeakingDetector({
          onSpeakingChange: (peerId, speaking) => {
            dispatch(setSpeaking({ userId: peerId, speaking }));
          },
        });

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
        // VAD on the local stream — drives self-tile speaking outline.
        detectorRef.current?.attach(myUserId, stream);

        unsubscribe = onSignal(async (event, payload) => {
          if (payload.toUserId !== myUserId) return;
          await manager.handleSignal(event, payload);
        });

        autoCallPeers(manager);
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
      if (credRefreshTimer) clearInterval(credRefreshTimer);
      unsubscribe?.();
      managerRef.current?.closeAll();
      managerRef.current = null;
      peerManagerRef.current = null;
      detectorRef.current?.destroy();
      detectorRef.current = null;
      dispatch(resetMedia());
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, myUserId, dispatch, callJoined]);


  // Reactive peer calling: fires whenever a new member arrives (initial roster
  // OR a late joiner via room:member-joined). The v3 bug was a single boolean
  // gate so the 3rd participant never got dialed by the first two — now we
  // track each peerId in calledPeersRef and only skip already-dialed ones.
  useEffect(() => {
    if (!callJoined) {
      calledPeersRef.current = new Set();
      return;
    }
    if (!managerRef.current) return;
    const manager = managerRef.current;
    const memberIds = new Set(members.map((m) => m.userId));
    // Drop stale entries so a kicked-and-rejoined player gets re-dialed.
    for (const id of [...calledPeersRef.current]) {
      if (!memberIds.has(id)) calledPeersRef.current.delete(id);
    }
    for (const member of members) {
      if (member.userId === myUserId) continue;
      if (calledPeersRef.current.has(member.userId)) continue;
      // Lex-lower side initiates; perfect negotiation handles glare if both fire.
      if (myUserId < member.userId) {
        calledPeersRef.current.add(member.userId);
        manager.call(member.userId);
      }
    }
  }, [members, myUserId, callJoined]);

  // Compute ordered/pinned lists unconditionally (hooks must not appear after early return).
  const orderedPeers = peerOrder.filter((id) => id in peers).map((id) => peers[id]!);
  const pinnedPeers = pinnedPeerIds.filter((id) => id in peers).map((id) => peers[id]!);
  const unpinnedPeers = orderedPeers.filter((p) => !pinnedPeerIds.includes(p.userId));

  const { getItemProps, isDragOver } = useDragReorder(
    orderedPeers,
    (p) => p.userId,
    (newOrder) => dispatch(reorderPeers(newOrder.map((p) => p.userId))),
  );

  const { getItemProps: getUnpinnedProps, isDragOver: isUnpinnedDragOver } = useDragReorder(
    unpinnedPeers,
    (p) => p.userId,
    (newOrder) => {
      const pinnedIds = pinnedPeerIds.filter((id) => id in peers);
      dispatch(reorderPeers([...pinnedIds, ...newOrder.map((p) => p.userId)]));
    },
  );

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
          <Button variant="primary" size="sm" onClick={onJoinCall}>
            {t('videoCall.joinBtn')}
          </Button>
          {error && <p className={styles.error}>{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.videoCall} aria-label={t('videoCall.aria')}>
      <div className={styles.cams}>
        {/* Pinned section */}
        {pinnedPeers.map((peer, idx) => (
          <div
            key={peer.userId}
            className={`${styles.tileWrap} ${isDragOver(idx) ? styles.dragOver : ''}`}
            {...getItemProps(idx)}
          >
            <VideoTile
              label={peer.userId.slice(0, 8)}
              stream={remoteStreamsRef.current[peer.userId] ?? null}
              connectionState={peer.connectionState}
              pinned
              speaking={speakingPeerIds.includes(peer.userId)}
              {...(peer.rttMs !== undefined ? { rttMs: peer.rttMs } : {})}
            />
          </div>
        ))}

        {/* Self tile — always first in unpinned area, not draggable */}
        <VideoTile
          label={t('videoCall.selfLabel')}
          stream={localStream}
          muted
          speaking={speakingPeerIds.includes(myUserId)}
        />

        {/* Unpinned remote tiles */}
        {unpinnedPeers.map((peer, idx) => (
          <div
            key={peer.userId}
            className={`${styles.tileWrap} ${isUnpinnedDragOver(idx) ? styles.dragOver : ''}`}
            {...getUnpinnedProps(idx)}
          >
            <VideoTile
              label={peer.userId.slice(0, 8)}
              stream={remoteStreamsRef.current[peer.userId] ?? null}
              connectionState={peer.connectionState}
              speaking={speakingPeerIds.includes(peer.userId)}
              {...(peer.rttMs !== undefined ? { rttMs: peer.rttMs } : {})}
            />
          </div>
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
