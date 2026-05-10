import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload } from 'lucide-react';
import type { AudioLayer, AudioMime } from '@vtt/shared';
import { AUDIO_MAX_BYTES, AUDIO_ALLOWED_MIME } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { uploadAudioTrack } from '../../store/audio';
import styles from './AudioPanel.module.css';

interface TrackUploadProps {
  roomId: string;
  sceneId: string | null;
  layer: AudioLayer;
}

export default function TrackUpload({ roomId, sceneId, layer }: TrackUploadProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'errors']);
  const dispatch = useAppDispatch();
  const uploadProgress = useAppSelector((s) => s.audio.uploadProgress);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loop, setLoop] = useState(false);
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
    if (!AUDIO_ALLOWED_MIME.includes(file.type as AudioMime)) {
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
          layer,
          sceneId: bindScene ? sceneId : null,
          loop,
        }),
      ).unwrap();
      setTitle('');
      setFile(null);
      setOpen(false);
    } catch (err) {
      setError(typeof err === 'string' ? err : t('errors:network.uploadFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className={styles.openUploadBtn}
        onClick={() => setOpen(true)}
      >
        <Upload size={14} aria-hidden />
        {t('campaign:audio.uploadShort')}
      </button>
    );
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
        accept="audio/mpeg,audio/ogg,audio/wav"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-label={t('campaign:audio.fileLabel')}
        required
      />
      {layer !== 'sfx' && (
        <label>
          <input
            type="checkbox"
            checked={loop}
            onChange={(e) => setLoop(e.target.checked)}
          />
          {t('campaign:audio.loopLabel')}
        </label>
      )}
      <label>
        <input
          type="checkbox"
          checked={bindScene}
          disabled={!sceneId}
          onChange={(e) => setBindScene(e.target.checked)}
        />
        {t('campaign:audio.bindSceneLabel')}
      </label>
      <div className={styles.uploadActions}>
        <button type="submit" className={styles.btnUpload} disabled={busy}>
          {busy ? t('campaign:audio.uploading') : t('campaign:audio.uploadBtn')}
        </button>
        <button
          type="button"
          className={styles.btnCancel}
          disabled={busy}
          onClick={() => { setOpen(false); setError(null); }}
        >
          {t('campaign:audio.uploadCancel')}
        </button>
      </div>
      {busy && uploadProgress !== null && (
        <div>
          <progress className={styles.uploadProgress} max={100} value={uploadProgress} />
          <span className={styles.uploadProgressLabel}>{uploadProgress}%</span>
        </div>
      )}
      {error && <p className={styles.uploadError}>{error}</p>}
    </form>
  );
}
