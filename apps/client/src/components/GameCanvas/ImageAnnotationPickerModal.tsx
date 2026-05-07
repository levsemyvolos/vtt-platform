import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDTO } from '@vtt/shared';
import AssetLibrary from '../AssetLibrary/AssetLibrary';
import ImageUpload from '../AssetUpload/ImageUpload';
import styles from './ImageAnnotationPickerModal.module.css';

interface Props {
  roomId: string;
  onPick: (asset: AssetDTO) => void;
  onClose: () => void;
}

/**
 * Sess 8 — modal AssetLibrary picker for the canvas image tool (Ф3.4.5).
 *
 * The image tool is a two-step gesture: (1) GM clicks the tool icon → this
 * modal opens with the room's image-type assets; (2) GM picks one → modal
 * closes, the cursor turns into a crosshair, and the next stage click places
 * the image at that point with natural aspect ratio (computed by the caller).
 *
 * Pure picker — does NOT itself dispatch or REST. Caller is responsible for
 * the placement REST + recording undo (so this modal stays reusable).
 */
export default function ImageAnnotationPickerModal({ roomId, onPick, onClose }: Props): JSX.Element {
  const { t } = useTranslation('room');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus + ESC close (matches TokenEditModal pattern).
  useEffect(() => {
    dialogRef.current?.focus();
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('imagePicker.heading', 'Pick image to place')}
        tabIndex={-1}
        className={styles.dialog}
      >
        <h3 className={styles.heading}>{t('imagePicker.heading', 'Pick image to place')}</h3>
        <p className={styles.hint}>{t('imagePicker.hint', 'Pick an existing image or upload a new one, then click on the scene to place it.')}</p>
        <ImageUpload roomId={roomId} onUploaded={onPick} />
        <div className={styles.libraryWrap}>
          <AssetLibrary
            roomId={roomId}
            tabs={['images']}
            pickLabel={t('imagePicker.pickLabel', 'Place on scene')}
            onPick={onPick}
          />
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            {t('imagePicker.cancel', 'Cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
