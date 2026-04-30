import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import {
  IMAGE_MAX_BYTES,
  IMAGE_ALLOWED_MIME,
  type ImageMime,
  initImageUpload,
  finalizeImageUpload,
  uploadBytesToGcs,
} from '../../api/assets';

interface ImageUploadProps {
  roomId: string;
  onUploaded: (asset: AssetDTO) => void;
}

export default function ImageUpload({ roomId, onUploaded }: ImageUploadProps): JSX.Element {
  const { t } = useTranslation(['room', 'errors']);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function validateFile(file: File): string | null {
    if (!IMAGE_ALLOWED_MIME.includes(file.type as ImageMime)) {
      return t('errors:validation.imageType');
    }
    if (file.size > IMAGE_MAX_BYTES) {
      return t('errors:validation.imageSize', { mb: (IMAGE_MAX_BYTES / 1024 / 1024).toFixed(0) });
    }
    return null;
  }

  async function upload(file: File): Promise<void> {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setProgress(t('room:asset.progressUrl'));
      const init = await initImageUpload({
        roomId,
        mimeType: file.type as ImageMime,
        size: file.size,
      });

      setProgress(t('room:asset.progressUpload'));
      await uploadBytesToGcs(init.uploadUrl, file);

      setProgress(t('room:asset.progressSave'));
      const asset = await finalizeImageUpload({
        roomId,
        storageKey: init.storageKey,
        mimeType: file.type as ImageMime,
        size: file.size,
      });

      setProgress(null);
      onUploaded(asset);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:network.uploadFailed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function handleFiles(files: FileList | null): void {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;
    void upload(file);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(true);
  }

  function handleDragLeave(): void {
    setDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    handleFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div
      className={`image-upload${dragging ? ' image-upload--dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label={t('room:asset.dropZoneLabel')}
    >
      <p className="image-upload__hint">
        {t('room:asset.dragHint')}{' '}
        <button
          type="button"
          className="image-upload__browse"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          {t('room:asset.browseBtn')}
        </button>
      </p>
      <p className="image-upload__formats">
        {t('room:asset.formatsHint', { mb: IMAGE_MAX_BYTES / 1024 / 1024 })}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ALLOWED_MIME.join(',')}
        onChange={handleChange}
        disabled={busy}
        style={{ display: 'none' }}
        aria-label={t('room:asset.fileInputLabel')}
      />

      {progress && <p className="image-upload__progress">{progress}</p>}
      {error && (
        <p role="alert" className="image-upload__error">
          {error}
        </p>
      )}
    </div>
  );
}
