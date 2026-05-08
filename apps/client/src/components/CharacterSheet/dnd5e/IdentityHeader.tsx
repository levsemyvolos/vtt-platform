import { useTranslation } from 'react-i18next';
import type { Identity5e } from '@vtt/shared';
import styles from './dnd5e.module.css';

export interface IdentityHeaderProps {
  value: Identity5e;
  characterName: string;
  onNameChange: (s: string) => void;
  onChange: (patch: Partial<Identity5e>) => void;
  disabled?: boolean;
}

/** Header strip with character name + class/level/race/background/alignment/XP. */
export default function IdentityHeader({
  value,
  characterName,
  onNameChange,
  onChange,
  disabled = false,
}: IdentityHeaderProps) {
  const { t } = useTranslation('campaign');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {/* Character name — wider than the grid fields */}
      <input
        type="text"
        value={characterName}
        disabled={disabled}
        aria-label={t('dnd5e.identity.characterName')}
        placeholder={t('dnd5e.identity.characterName')}
        style={{ fontSize: '1.125rem', fontWeight: 700, width: '100%' }}
        onChange={(e) => onNameChange(e.target.value)}
      />

      <div className={styles.identityGrid}>
        <div className={styles.statGroup}>
          <span className={styles.statLabel}>{t('dnd5e.identity.className')}</span>
          <input
            type="text"
            value={value.className ?? ''}
            disabled={disabled}
            aria-label={t('dnd5e.identity.className')}
            onChange={(e) => onChange({ className: e.target.value })}
          />
        </div>

        <div className={styles.statGroup}>
          <span className={styles.statLabel}>{t('dnd5e.identity.level')}</span>
          <input
            type="number"
            value={value.level ?? ''}
            min={1}
            max={20}
            disabled={disabled}
            aria-label={t('dnd5e.identity.level')}
            style={{ width: '3.5rem' }}
            onChange={(e) => {
              if (e.target.value === '') {
                onChange({});
              } else {
                onChange({ level: Number(e.target.value) });
              }
            }}
          />
        </div>

        <div className={styles.statGroup}>
          <span className={styles.statLabel}>{t('dnd5e.identity.race')}</span>
          <input
            type="text"
            value={value.race ?? ''}
            disabled={disabled}
            aria-label={t('dnd5e.identity.race')}
            onChange={(e) => onChange({ race: e.target.value })}
          />
        </div>

        <div className={styles.statGroup}>
          <span className={styles.statLabel}>{t('dnd5e.identity.background')}</span>
          <input
            type="text"
            value={value.background ?? ''}
            disabled={disabled}
            aria-label={t('dnd5e.identity.background')}
            onChange={(e) => onChange({ background: e.target.value })}
          />
        </div>

        <div className={styles.statGroup}>
          <span className={styles.statLabel}>{t('dnd5e.identity.alignment')}</span>
          <input
            type="text"
            value={value.alignment ?? ''}
            disabled={disabled}
            aria-label={t('dnd5e.identity.alignment')}
            onChange={(e) => onChange({ alignment: e.target.value })}
          />
        </div>

        <div className={styles.statGroup}>
          <span className={styles.statLabel}>{t('dnd5e.identity.experiencePoints')}</span>
          <input
            type="number"
            value={value.experiencePoints ?? ''}
            min={0}
            disabled={disabled}
            aria-label={t('dnd5e.identity.experiencePoints')}
            onChange={(e) => {
              if (e.target.value === '') {
                onChange({});
              } else {
                onChange({ experiencePoints: Number(e.target.value) });
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
