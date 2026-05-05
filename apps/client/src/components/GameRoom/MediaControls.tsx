import { useTranslation } from 'react-i18next';
import { Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import { toggleCamera as toggleCameraAction, toggleMic as toggleMicAction } from '../../store/media';
import { peerManagerRef } from '../../infrastructure/webrtc/peerManagerRef';
import styles from './MediaControls.module.css';

/**
 * Mic / Camera toggle bar. Renders below the camera grid in PartyColumn,
 * before the participants split. Visible only when the user has joined
 * the call and the local stream is ready.
 */
export default function MediaControls(): JSX.Element | null {
  const { t } = useTranslation('gameroom');
  const dispatch = useAppDispatch();
  const { micEnabled, cameraEnabled, localStreamReady, callJoined, meshCeilingReached } =
    useAppSelector((s) => s.media);

  if (!callJoined || !localStreamReady) return null;

  function onToggleMic(): void {
    const next = !micEnabled;
    peerManagerRef.current?.setMicEnabled(next);
    dispatch(toggleMicAction());
  }

  function onToggleCamera(): void {
    if (meshCeilingReached) return;
    const next = !cameraEnabled;
    peerManagerRef.current?.setCameraEnabled(next);
    dispatch(toggleCameraAction());
  }

  return (
    <div className={styles.controls} role="group" aria-label={t('mediaControls.aria')}>
      <button
        type="button"
        className={styles.btn}
        onClick={onToggleMic}
        aria-pressed={micEnabled}
        aria-label={micEnabled ? t('videoCall.muteMic') : t('videoCall.unmuteMic')}
        title={micEnabled ? t('videoCall.muteMic') : t('videoCall.unmuteMic')}
      >
        {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
        <span>{micEnabled ? t('videoCall.micOn') : t('videoCall.micOff')}</span>
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={onToggleCamera}
        disabled={meshCeilingReached}
        aria-pressed={cameraEnabled}
        aria-label={cameraEnabled ? t('videoCall.camOff') : t('videoCall.camOn')}
        title={meshCeilingReached ? t('videoCall.meshCeiling') : undefined}
      >
        {cameraEnabled && !meshCeilingReached ? <Video size={14} /> : <VideoOff size={14} />}
        <span>{cameraEnabled && !meshCeilingReached ? t('videoCall.camOn') : t('videoCall.camOff')}</span>
      </button>
    </div>
  );
}
