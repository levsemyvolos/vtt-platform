import { useAppDispatch, useAppSelector } from '../../store';
import { setTheme, type ThemeMode } from '../../store/preferences';

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '☀️ Light' },
  { value: 'dark', label: '🌙 Dark' },
  { value: 'system', label: '💻 System' },
];

export default function ThemeToggle() {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((s) => s.preferences.theme);

  return (
    <div className="theme-toggle" role="group" aria-label="Тема оформлення">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`theme-toggle__btn${theme === opt.value ? ' theme-toggle__btn--active' : ''}`}
          onClick={() => dispatch(setTheme(opt.value))}
          aria-pressed={theme === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
