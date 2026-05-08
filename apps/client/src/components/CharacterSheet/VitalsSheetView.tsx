/**
 * VitalsSheetView — shows VitalsStrip + freeform notes textarea for SheetVitals mode.
 */
import { useTranslation } from 'react-i18next';
import type { VitalsBlock } from '@vtt/shared';
import VitalsStrip from './VitalsStrip';
import styles from './CharacterSheet.module.css';

export interface VitalsSheetViewProps {
  vitals: VitalsBlock;
  notes: string;
  onChangeVitals: (patch: Partial<VitalsBlock>) => void;
  onChangeNotes: (notes: string) => void;
  disabled?: boolean;
}

export default function VitalsSheetView({
  vitals,
  notes,
  onChangeVitals,
  onChangeNotes,
  disabled = false,
}: VitalsSheetViewProps): JSX.Element {
  const { t } = useTranslation('campaign');

  return (
    <div className={styles.col}>
      <section className={styles.section} aria-label={t('dnd5e.section.vitals', { defaultValue: 'Vitals' })}>
        <span className={styles.sectionTitle}>
          {t('dnd5e.section.vitals', { defaultValue: 'Vitals' })}
        </span>
        <VitalsStrip vitals={vitals} onChange={onChangeVitals} disabled={disabled} />
      </section>

      <section className={styles.section} aria-label={t('dnd5e.section.notes', { defaultValue: 'Notes' })}>
        <span className={styles.sectionTitle}>
          {t('dnd5e.section.notes', { defaultValue: 'Notes' })}
        </span>
        <textarea
          className={styles.textarea}
          value={notes}
          disabled={disabled}
          aria-label={t('dnd5e.section.notes', { defaultValue: 'Notes' })}
          rows={6}
          onChange={(e) => { onChangeNotes(e.target.value); }}
        />
      </section>
    </div>
  );
}
