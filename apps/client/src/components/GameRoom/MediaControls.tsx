import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import { toggleCamera as toggleCameraAction, toggleMic as toggleMicAction } from '../../store/media';
import { peerManagerRef } from '../../infrastructure/webrtc/peerManagerRef';
import { IconButton } from '../ui';
import styles from './MediaControls.module.css';

function MicButton({ enabled }: { enabled: boolean }): JSX.Element {
  const { t } = useTranslation('gameroom');
  const dispatch = useAppDispatch();
  const label = enabled ? t('videoCall.muteMic') : t('videoCall.unmuteMic');
  function onClick(): void {
    peerManagerRef.current?.setMicEnabled(!enabled);
    dispatch(toggleMicAction());
  }
  return (
    <IconButton
      variant="ghost"
      size="sm"
      onClick={onClick}
      isActive={enabled}
      aria-label={label}
      title={label}
      className={enabled ? styles.emberActive : undefined}
    >
      {enabled ? <Mic size={14} /> : <MicOff size={14} />}
    </IconButton>
  );
}

function CamButton({ enabled, ceiling }: { enabled: boolean; ceiling: boolean }): JSX.Element {
  const { t } = useTranslation('gameroom');
  const dispatch = useAppDispatch();
  const on = enabled && !ceiling;
  const label = enabled ? t('videoCall.camOff') : t('videoCall.camOn');
  const title = ceiling ? t('videoCall.meshCeiling') : undefined;
  function onClick(): void {
    if (ceiling) return;
    peerManagerRef.current?.setCameraEnabled(!enabled);
    dispatch(toggleCameraAction());
  }
  return (
    <IconButton
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={ceiling}
      isActive={on}
      aria-label={label}
      title={title ?? label}
      className={on ? styles.emberActive : undefined}
    >
      {on ? <Video size={14} /> : <VideoOff size={14} />}
    </IconButton>
  );
}

/**
 * Mic / Camera toggle bar. Renders below the camera grid in PartyColumn,
 * before the participants split. Visible only when the user has joined
 * the call and the local stream is ready.
 */
export default function MediaControls(): JSX.Element | null {
  const { t } = useTranslation('gameroom');
  const { micEnabled, cameraEnabled, localStreamReady, callJoined, meshCeilingReached } =
    useAppSelector((s) => s.media);

  if (!callJoined || !localStreamReady) return null;

  return (
    <div className={styles.controls} role="group" aria-label={t('mediaControls.aria')}>
      <MicButton enabled={micEnabled} />
      <CamButton enabled={cameraEnabled} ceiling={meshCeilingReached} />
    </div>
  );
}
