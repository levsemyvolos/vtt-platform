import { useEffect, useRef } from 'react';

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
    <figure className="video-tile" data-state={connectionState ?? 'local'}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        aria-label={`Відеовіконце ${label}`}
      />
      <figcaption className="video-tile__caption">
        <span className="video-tile__name">{label}</span>
        {connectionState && (
          <span className="video-tile__state">{connectionState}</span>
        )}
      </figcaption>
    </figure>
  );
}
