import { useTranslation } from 'react-i18next';
import styles from './EditToggle.module.css';

interface EditToggleProps {
  pressed: boolean;
  onPressedChange: (next: boolean) => void;
  disabled?: boolean;
}

/**
 * Manuscript edit-mode toggle. LED dot turns from --ink-faint to
 * --primary (with halo) when edit mode is on. Drives the readOnly
 * flag that propagates through the sheet body — when off, all inputs
 * become read-only without losing layout.
 */
export default function EditToggle({
  pressed,
  onPressedChange,
  disabled = false,
}: EditToggleProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const label = t('character.editMode', { defaultValue: 'Edit mode' });
  return (
    <button
      type="button"
      className={`${styles.editToggle} ${pressed ? styles.editToggleOn : ''}`}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
    >
      <span className={styles.led} aria-hidden="true" />
      {label}
    </button>
  );
}
