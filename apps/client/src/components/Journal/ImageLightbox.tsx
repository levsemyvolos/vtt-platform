import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import styles from './ImageLightbox.module.css';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

export default function ImageLightbox({ src, alt, onClose }: Props): JSX.Element {
  const { t } = useTranslation('campaign');

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t('journal.lightbox.closeAriaLabel', { defaultValue: 'Close image preview' })}
      onClick={onClose}
    >
      <button
        type="button"
        className={styles.closeBtn}
        onClick={onClose}
        aria-label={t('journal.lightbox.closeAriaLabel', { defaultValue: 'Close image preview' })}
      >
        ✕
      </button>
      {/* Prevent click on the image from closing the lightbox */}
      <img
        src={src}
        alt={alt}
        className={styles.img}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
