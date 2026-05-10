import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { Role } from '@vtt/shared';
import CharacterSheet from './CharacterSheet';
import Logo from '../ui/Logo';
import { useAppSelector } from '../../store';
import styles from './CharacterSheetOverlay.module.css';

interface CharacterSheetOverlayProps {
  roomId: string;
  myRole: Role;
  /** Character to display (GM may pick from list; Player always sees own). */
  characterId: string | null;
  onClose: () => void;
}

export default function CharacterSheetOverlay({
  roomId, myRole, characterId, onClose,
}: CharacterSheetOverlayProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const currentName = useAppSelector((s) => s.characters.current?.name);

  // Esc → close (standard modal a11y; mirrors AssistantPanel behavior)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const headingLabel = t('character.overlayTitle', { defaultValue: 'Character Sheet' });
  const closeLabel = t('character.closeOverlay', { defaultValue: 'Close character sheet' });
  const eyebrow = t('character.heading', { defaultValue: 'Characters' });
  const portraitInitial = currentName ? currentName.trim().charAt(0).toUpperCase() : '';

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={headingLabel}
      >
        <span className={`${styles.panelCorner} ${styles.panelCornerTl}`} aria-hidden="true" />
        <span className={`${styles.panelCorner} ${styles.panelCornerTr}`} aria-hidden="true" />
        <span className={`${styles.panelCorner} ${styles.panelCornerBl}`} aria-hidden="true" />
        <span className={`${styles.panelCorner} ${styles.panelCornerBr}`} aria-hidden="true" />

        <header className={styles.header}>
          <div className={styles.headerMark} aria-hidden="true">
            <Logo size={22} withText={false} />
          </div>
          <div className={styles.headerInfo}>
            <span className={styles.headerEyebrow}>{eyebrow}</span>
            <h1 className={styles.headerTitle}>{currentName || headingLabel}</h1>
          </div>
          {portraitInitial && (
            <div className={styles.portrait} aria-hidden="true">{portraitInitial}</div>
          )}
          <button
            type="button"
            className={styles.headerClose}
            onClick={onClose}
            aria-label={closeLabel}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.body}>
          <CharacterSheet
            characterId={characterId}
            roomId={roomId}
            myRole={myRole}
          />
        </div>
      </div>
    </div>
  );
}
