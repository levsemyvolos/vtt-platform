import { useEffect } from 'react';
import { useAppSelector } from '../store';

/**
 * Resolves the active theme from the preferences store and
 * applies it to document.documentElement.dataset.theme.
 * 'system' option was removed in Phase 0 — only 'light' | 'dark'.
 */
export function useTheme(): 'light' | 'dark' {
  const themeMode = useAppSelector((s) => s.preferences.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
  }, [themeMode]);

  return themeMode;
}
