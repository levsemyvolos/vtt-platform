import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'light' | 'dark' | 'system';

interface PreferencesState {
  theme: ThemeMode;
}

function loadFromStorage(): PreferencesState {
  try {
    const raw = localStorage.getItem('preferences');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PreferencesState>;
      if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
        return { theme: parsed.theme };
      }
    }
  } catch {
    // corrupt storage — fall through to default
  }
  return { theme: 'system' };
}

const preferencesSlice = createSlice({
  name: 'preferences',
  initialState: loadFromStorage(),
  reducers: {
    setTheme(state, action: PayloadAction<ThemeMode>) {
      state.theme = action.payload;
      try {
        localStorage.setItem('preferences', JSON.stringify({ theme: action.payload }));
      } catch {
        // quota exceeded or private browsing — ignore
      }
    },
  },
});

export const { setTheme } = preferencesSlice.actions;
export default preferencesSlice.reducer;
