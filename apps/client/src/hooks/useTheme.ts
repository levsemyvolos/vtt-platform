import { useEffect, useState } from 'react';
import { useAppSelector } from '../store';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolves the active theme from the preferences store.
 * When mode is 'system', follows the OS prefers-color-scheme and reacts to changes.
 * Applies the resolved theme to document.documentElement.dataset.theme.
 */
export function useTheme(): 'light' | 'dark' {
  const themeMode = useAppSelector((s) => s.preferences.theme);
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(getSystemTheme);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent): void => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: 'light' | 'dark' = themeMode === 'system' ? systemTheme : themeMode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return resolved;
}
