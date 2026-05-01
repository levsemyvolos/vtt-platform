import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AUDIO_MAX_BYTES } from '@vtt/shared';
import { useAppDispatch } from '../../store';
import { uploadAudioTrack } from '../../store/audio';
import styles from './AudioPanel.module.css';

interface TrackUploadProps {
  roomId: string;
  sceneId: string | null;
}

export default function TrackUpload({ roomId, sceneId }: TrackUploadProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'errors']);
  const dispatch = useAppDispatch();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loop, setLoop] = useState(false);
  const [fadeMs, setFadeMs] = useState(1500);
  const [bindScene, setBindScene] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError(t('errors:validation.audioFileRequired'));
      return;
    }
    if (file.type !== 'audio/mpeg' && file.type !== 'audio/ogg') {
      setError(t('errors:validation.audioType'));
      return;
    }
    if (file.size > AUDIO_MAX_BYTES) {
      setError(t('errors:validation.audioSize', { mb: (AUDIO_MAX_BYTES / 1024 / 1024).toFixed(0) }));
      return;
    }
    setBusy(true);
    try {
      await dispatch(
        uploadAudioTrack({
          roomId,
          file,
          title: title.trim() || file.name,
          sceneId: bindScene ? sceneId : null,
          loop,
          fadeMs,
        }),
      ).unwrap();
      setTitle('');
      setFile(null);
      setFadeMs(1500);
    } catch (err) {
      setError(typeof err === 'string' ? err : t('errors:network.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className={styles.uploadForm}>
      <input
        type="text"
        placeholder={t('campaign:audio.trackTitlePlaceholder')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label={t('campaign:audio.trackTitleLabel')}
      />
      <input
        type="file"
        accept="audio/mpeg,audio/ogg"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-label={t('campaign:audio.fileLabel')}
        required
      />
      <label>
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
        />
        {t('campaign:audio.loopLabel')}
      </label>
      <label className={styles.editRow}>
        {t('campaign:audio.fadeLabel', { ms: fadeMs })}
        <input
          type="range"
          min={0}
          max={5000}
          step={100}
          value={fadeMs}
          onChange={(e) => setFadeMs(Number(e.target.value))}
          aria-label={t('campaign:audio.fadeAriaLabel')}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={bindScene}
          disabled={!sceneId}
          onChange={(e) => setBindScene(e.target.checked)}
        />
        {t('campaign:audio.bindSceneLabel')}
      </label>
      <button type="submit" className={styles.btnUpload} disabled={busy}>
        {busy ? t('campaign:audio.uploading') : t('campaign:audio.uploadBtn')}
      </button>
      {error && <p className={styles.uploadError}>{error}</p>}
    </form>
  );
}
