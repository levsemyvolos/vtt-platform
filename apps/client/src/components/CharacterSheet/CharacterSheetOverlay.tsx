import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { Role } from '@vtt/shared';
import CharacterSheet from './CharacterSheet';
import { IconButton } from '../ui';
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

  return (
    <div className={styles.backdrop} role="presentation">
      <div
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-label={headingLabel}
      >
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <span className={styles.title}>{headingLabel}</span>
            {currentName ? (
              <span className={styles.characterName}>{currentName}</span>
            ) : null}
          </div>
          <IconButton
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label={t('character.closeOverlay', { defaultValue: 'Close character sheet' })}
          >
            <X size={18} aria-hidden />
          </IconButton>
        </div>
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
