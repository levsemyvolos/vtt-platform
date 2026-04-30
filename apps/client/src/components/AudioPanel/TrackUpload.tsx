import { useState, type FormEvent } from 'react';
import { AUDIO_MAX_BYTES } from '@vtt/shared';
import { useAppDispatch } from '../../store';
import { uploadAudioTrack } from '../../store/audio';

interface TrackUploadProps {
  roomId: string;
  /** Optional default scene-binding for the new track. */
  sceneId: string | null;
}

/**
 * GM-only upload form. Presigned-PUT flow (sequence А.7). Client-side
 * MIME/size validation mirrors the server's guards (НФВ 6.3).
 * fadeMs slider sets persistent fade-in/out duration (R8, Ф6.2).
 */
export default function TrackUpload({ roomId, sceneId }: TrackUploadProps): JSX.Element {
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
      setError('Виберіть файл MP3 або OGG');
      return;
    }
    if (file.type !== 'audio/mpeg' && file.type !== 'audio/ogg') {
      setError('Лише MP3 (audio/mpeg) або OGG (audio/ogg)');
      return;
    }
    if (file.size > AUDIO_MAX_BYTES) {
      setError(`Файл перевищує ${(AUDIO_MAX_BYTES / 1024 / 1024).toFixed(0)} МБ`);
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
      setError(typeof err === 'string' ? err : 'Помилка завантаження');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="audio-upload">
      <input
        type="text"
        placeholder="Назва треку"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Назва аудіо-треку"
      />
      <input
        type="file"
        accept="audio/mpeg,audio/ogg"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        aria-label="Аудіо-файл (MP3 / OGG)"
        required
      />
      <label>
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
        />
        Loop
      </label>
      <label className="audio-upload__fade">
        Fade {fadeMs} мс
        <input
          type="range"
          min={0}
          max={5000}
          step={100}
          value={fadeMs}
          onChange={(e) => setFadeMs(Number(e.target.value))}
          aria-label="Тривалість fade-in/out у мілісекундах"
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={bindScene}
          disabled={!sceneId}
          onChange={(e) => setBindScene(e.target.checked)}
        />
        Прив'язати до активної сцени
      </label>
      <button type="submit" disabled={busy}>
        {busy ? 'Завантаження…' : 'Завантажити'}
      </button>
      {error && <p className="audio-upload__error">{error}</p>}
    </form>
  );
}
