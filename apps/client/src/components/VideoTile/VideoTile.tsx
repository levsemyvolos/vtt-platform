import { useEffect, useRef } from 'react';
import { Pin } from 'lucide-react';
import ConnectionState from '../VideoCall/ConnectionState';
import styles from './VideoTile.module.css';

interface VideoTileProps {
  label: string;
  stream: MediaStream | null;
  muted?: boolean;
  connectionState?: RTCPeerConnectionState;
  pinned?: boolean;
  rttMs?: number | undefined;
  speaking?: boolean;
}

function rttClass(ms: number): string {
  if (ms < 80) return styles.rttGood ?? '';
  if (ms < 200) return styles.rttWarn ?? '';
  return styles.rttBad ?? '';
}

export default function VideoTile({
  label,
  stream,
  muted,
  connectionState,
  pinned,
  rttMs,
  speaking,
}: VideoTileProps): JSX.Element {
  const isMuted = muted ?? false;
  const isPinned = pinned ?? false;
  const isSpeaking = speaking ?? false;
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  return (
    <figure
      className={`${styles.tile} ${isSpeaking ? styles.speaking ?? '' : ''}`}
      data-state={connectionState ?? 'local'}
    >
      <video
        ref={videoRef}
        className={styles.video}
        autoPlay
        playsInline
        muted={isMuted}
        aria-label={`Відеовіконце ${label}`}
      />
      {connectionState && <ConnectionState state={connectionState} />}
      {isPinned && (
        <span className={styles.pinBadge} title="Pinned">
          <Pin size={10} />
        </span>
      )}
      {rttMs !== undefined && (
        <span className={`${styles.rttBadge} ${rttClass(rttMs)}`}>{rttMs} ms</span>
      )}
      <figcaption className={styles.caption}>
        <span className={styles.name}>{label}</span>
      </figcaption>
    </figure>
  );
}
