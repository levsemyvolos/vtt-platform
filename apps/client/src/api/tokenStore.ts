const REFRESH_KEY = 'vtt_refresh_token';

let _accessToken: string | null = null;

export const tokenStore = {
  getAccess: (): string | null => _accessToken,

  setAccess: (token: string | null): void => {
    _accessToken = token;
  },

  getRefresh: (): string | null => localStorage.getItem(REFRESH_KEY),

  setRefresh: (token: string | null): void => {
    if (token !== null) {
      localStorage.setItem(REFRESH_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  },

  clear: (): void => {
    _accessToken = null;
    localStorage.removeItem(REFRESH_KEY);
  },
};
