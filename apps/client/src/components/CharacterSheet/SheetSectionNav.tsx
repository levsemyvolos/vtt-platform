import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  const mainRef = useRef<HTMLDivElement>(null);
  const [activeRail, setActiveRail] = useState<SheetSectionId>(activeMobile);

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

  // Sync rail when mobile tab changes (mobile-first state)
  useEffect(() => {
    setActiveRail(activeMobile);
  }, [activeMobile]);

  // Observe section visibility on desktop to update active rail entry while scrolling
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const sections = SHEET_SECTION_IDS
      .map((id) => document.getElementById(`sheet-section-${id}`))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length === 0) return;
        const id = visible[0]?.target.id.replace('sheet-section-', '') as SheetSectionId | undefined;
        if (id && (SHEET_SECTION_IDS as ReadonlyArray<string>).includes(id)) {
          setActiveRail(id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    sections.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function scrollTo(id: SheetSectionId): void {
    setActiveRail(id);
    onMobileChange(id);
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
        <span className={styles.railEyebrow}>{t('character.sheetNav.railEyebrow', { defaultValue: 'Sections' })}</span>
        {SHEET_SECTION_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className={styles.railBtn}
            aria-current={activeRail === id ? 'true' : undefined}
            onClick={() => scrollTo(id)}
          >
            {labels[id]}
          </button>
        ))}
      </nav>

      <div className={styles.main} ref={mainRef}>
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
