import { useTranslation } from 'react-i18next';
import type { AssistantContext } from '@vtt/shared';
import styles from './ConversationView.module.css';

interface Preset {
  label: string;
  prompt: string;
}

interface PresetChipsProps {
  context: AssistantContext;
  onSelect: (prompt: string) => void;
}

export default function PresetChips({ context, onSelect }: PresetChipsProps): JSX.Element {
  const { t } = useTranslation('assistant');
  const presets = t(`presets.${context}`, { returnObjects: true }) as Preset[] | string;

  // i18next returns the key string when the path is missing — guard against that.
  if (!Array.isArray(presets)) return <></>;

  return (
    <div className={styles.modeChips} role="toolbar" aria-label={t('presetChips.ariaLabel')}>
      {presets.map((p, idx) => (
        <button
          key={idx}
          type="button"
          className={styles.chip}
          onClick={() => onSelect(p.prompt)}
          title={p.prompt}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
