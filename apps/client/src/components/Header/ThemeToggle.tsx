import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { setTheme, type ThemeMode } from '../../store/preferences';
import styles from './ThemeToggle.module.css';

const OPTIONS: { value: ThemeMode; key: 'light' | 'dark' }[] = [
  { value: 'light', key: 'light' },
  { value: 'dark', key: 'dark' },
];

export default function ThemeToggle() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.preferences.theme);
  const { t } = useTranslation('common');

  return (
    <div
      className={styles.toggle}
      role="radiogroup"
      aria-label={t('theme.label')}
    >
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={theme === opt.value ? styles.on : undefined}
          onClick={() => dispatch(setTheme(opt.value))}
          aria-checked={theme === opt.value}
          role="radio"
        >
          {t(`theme.${opt.key}`)}
        </button>
      ))}
    </div>
  );
}
