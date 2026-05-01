import { useEffect, useRef } from 'react';
import ConnectionState from '../VideoCall/ConnectionState';
import styles from './VideoTile.module.css';

interface VideoTileProps {
  /** Display label (typically participant name). */
  label: string;
  /** Live media stream — local mic+camera or remote peer track. */
  stream: MediaStream | null;
  /** Mute the audio output (always true for the local self-tile to avoid feedback). */
  muted?: boolean;
  /** Indicator of WebRTC connection state for remote tiles. */
  connectionState?: RTCPeerConnectionState;
}

export default function VideoTile({
  label,
  stream,
  muted = false,
  connectionState,
}: VideoTileProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
  }, [stream]);

  return (
    <figure className={styles.tile} data-state={connectionState ?? 'local'}>
      <video
        ref={videoRef}
        className={styles.video}
        autoPlay
        playsInline
        muted={muted}
        aria-label={`Відеовіконце ${label}`}
      />
      {connectionState && <ConnectionState state={connectionState} />}
      <figcaption className={styles.caption}>
        <span className={styles.name}>{label}</span>
      </figcaption>
    </figure>
  );
}
