import { useEffect, useRef, useState } from 'react';
import type { TurnConfigResponse } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  resetMedia,
  setLocalStreamReady,
  toggleCamera as toggleCameraAction,
  toggleMic as toggleMicAction,
  upsertPeer,
  removePeer,
} from '../../store/media';
import VideoTile from '../VideoTile/VideoTile';
import { PeerManager } from '../../infrastructure/webrtc/PeerManager';
import { apiFetch } from '../../api/apiFetch';
import { emitSignal, onSignal } from '../../api/socket';

interface VideoCallProps {
  roomId: string;
  myUserId: string;
}

/**
 * Mounts the WebRTC stack inside the Sidebar (Чат 6 vertical 4 — integration).
 *
 * MVP: brings up the local microphone/camera stream and renders a `<VideoTile>`
 * for the user themselves plus any remote peer whose stream has been delivered
 * through the signaling proxy. Peer discovery (who-is-online presence) is not
 * implemented in the diploma scope — that channel is a follow-up. As long as
 * a peer manually issues `signal:offer`, the mesh works (the proxy is in
 * place, see `apps/server/src/socketio/handlers/signaling.ts`).
 */
export default function VideoCall({ roomId, myUserId }: VideoCallProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { micEnabled, cameraEnabled, localStreamReady, peers } = useAppSelector((s) => s.media);
  const managerRef = useRef<PeerManager | null>(null);
  const remoteStreamsRef = useRef<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    async function bootstrap(): Promise<void> {
      try {
        const cfg = await apiFetch<TurnConfigResponse>('/api/turn-config');
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
            },
            onPeerClosed: (peerId) => {
              delete remoteStreamsRef.current[peerId];
              dispatch(removePeer(peerId));
            },
          },
        });
        managerRef.current = manager;

        const stream = await manager.startLocalMedia({ audio: true, video: true });
        if (cancelled) {
          manager.closeAll();
          return;
        }
        setLocalStream(stream);
        dispatch(setLocalStreamReady(true));

        unsubscribe = onSignal(async (event, payload) => {
          if (payload.toUserId !== myUserId) return;
          await manager.handleSignal(event, payload);
        });
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
  }, [roomId, myUserId, dispatch]);

  function onToggleMic(): void {
    const next = !micEnabled;
    managerRef.current?.setMicEnabled(next);
    dispatch(toggleMicAction());
  }

  function onToggleCamera(): void {
    const next = !cameraEnabled;
    managerRef.current?.setCameraEnabled(next);
    dispatch(toggleCameraAction());
  }

  const remoteList = Object.values(peers);

  return (
    <section className="video-call" aria-label="Відео-чат сесії">
      <div className="video-call__tiles">
        <VideoTile label="Я" stream={localStream} muted />
        {remoteList.map((peer) => (
          <VideoTile
            key={peer.userId}
            label={peer.userId.slice(0, 8)}
            stream={remoteStreamsRef.current[peer.userId] ?? null}
            connectionState={peer.connectionState}
          />
        ))}
      </div>
      <div className="video-call__controls">
        <button
          type="button"
          onClick={onToggleMic}
          disabled={!localStreamReady}
          aria-pressed={!micEnabled}
        >
          {micEnabled ? '🎙 Mute' : '🔇 Unmute'}
        </button>
        <button
          type="button"
          onClick={onToggleCamera}
          disabled={!localStreamReady}
          aria-pressed={!cameraEnabled}
        >
          {cameraEnabled ? '📷 Off' : '📸 On'}
        </button>
      </div>
      {error && <p className="video-call__error">{error}</p>}
    </section>
  );
}
