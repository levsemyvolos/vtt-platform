import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import Tabs, { type TabItem } from '../ui/Tabs';
import styles from './SheetSectionNav.module.css';

export const SHEET_SECTION_IDS = [
  'overview',
  'combat',
  'abilities',
  'skills',
  'spellcasting',
  'personality',
] as const;

export type SheetSectionId = (typeof SHEET_SECTION_IDS)[number];

interface SheetSectionNavProps {
  activeMobile: SheetSectionId;
  onMobileChange: (id: SheetSectionId) => void;
  children: Record<SheetSectionId, ReactNode>;
}

export default function SheetSectionNav({
  activeMobile,
  onMobileChange,
  children,
}: SheetSectionNavProps): JSX.Element {
  const { t } = useTranslation('campaign');

  const labels = useMemo(
    () =>
      SHEET_SECTION_IDS.reduce(
        (acc, id) => {
          acc[id] = t(`character.sheetNav.${id}`);
          return acc;
        },
        {} as Record<SheetSectionId, string>,
      ),
    [t],
  );

  const tabItems: ReadonlyArray<TabItem<SheetSectionId>> = useMemo(
    () => SHEET_SECTION_IDS.map((id) => ({ id, label: labels[id] })),
    [labels],
  );

  function scrollTo(id: SheetSectionId): void {
    document.getElementById(`sheet-section-${id}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <div className={styles.root}>
      <div className={styles.mobileTabs}>
        <Tabs
          variant="segmented"
          items={tabItems}
          value={activeMobile}
          onChange={onMobileChange}
          ariaLabel={t('character.sheetNav.aria')}
          className={styles.tabsStretch ?? ''}
        />
      </div>

      <nav className={styles.rail} aria-label={t('character.sheetNav.aria')}>
        {SHEET_SECTION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.railBtn}
            onClick={() => scrollTo(id)}
          >
            {labels[id]}
          </button>
        ))}
      </nav>

      <div className={styles.main}>
        {SHEET_SECTION_IDS.map((id) => (
          <section
            key={id}
            id={`sheet-section-${id}`}
            className={`${styles.sectionWrap} ${activeMobile !== id ? styles.mobileHidden : ''}`}
            aria-labelledby={`sheet-section-${id}-title`}
          >
            <h2 id={`sheet-section-${id}-title`} className={styles.sectionHeading}>
              {labels[id]}
            </h2>
            {children[id]}
          </section>
        ))}
      </div>
    </div>
  );
}
