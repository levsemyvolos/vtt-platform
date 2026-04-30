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
 * GM-only upload form. Uses the presigned-PUT flow inside `uploadAudioTrack`
 * thunk: client-side validation here mirrors the server's MIME/size guards
 * (НФВ 6.3) so we fail early before requesting a signed URL.
 */
export default function TrackUpload({ roomId, sceneId }: TrackUploadProps): JSX.Element {
  const dispatch = useAppDispatch();
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
        }),
      ).unwrap();
      setTitle('');
      setFile(null);
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
