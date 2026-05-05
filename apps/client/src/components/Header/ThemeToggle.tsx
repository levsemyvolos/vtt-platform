import { useAppDispatch, useAppSelector } from '../../store';
import { setTheme, type ThemeMode } from '../../store/preferences';
import styles from './Header.module.css';

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function ThemeToggle() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.preferences.theme);

  return (
    <div className={styles.themeToggle} role="group" aria-label="Тема оформлення">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={theme === opt.value ? `${styles.btn} ${styles.btnActive}` : styles.btn}
          onClick={() => dispatch(setTheme(opt.value))}
          aria-pressed={theme === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
