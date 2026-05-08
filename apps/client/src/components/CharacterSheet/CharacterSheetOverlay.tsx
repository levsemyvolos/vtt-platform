import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import CharacterSheet from './CharacterSheet';
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

  // Esc → close (standard modal a11y; mirrors AssistantPanel behavior)
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={t('character.overlayTitle', { defaultValue: 'Character Sheet' })}
    >
      <div className={styles.header}>
        <span className={styles.title}>
          {t('character.overlayTitle', { defaultValue: 'Character Sheet' })}
        </span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('character.closeOverlay', { defaultValue: 'Close character sheet' })}
        >✕</button>
      </div>
      <div className={styles.body}>
        <CharacterSheet
          characterId={characterId}
          roomId={roomId}
          myRole={myRole}
        />
      </div>
    </div>
  );
}
