import i18next, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

type SupportedLng = 'en' | 'uk';
type NS = 'common' | 'auth' | 'room' | 'campaign' | 'assistant' | 'errors' | 'nav' | 'gameroom';

const SUPPORTED_LNGS: SupportedLng[] = ['en', 'uk'];
const NAMESPACES: NS[] = ['common', 'auth', 'room', 'campaign', 'assistant', 'errors', 'nav', 'gameroom'];

async function loadLocale(lang: SupportedLng, ns: NS): Promise<unknown> {
  const mod = await import(`../locales/${lang}/${ns}.json`);
  return mod.default as unknown;
}

export async function initI18n(): Promise<void> {
  const resources: Record<string, Record<string, unknown>> = {};

  await Promise.all(
    SUPPORTED_LNGS.map(async (lang) => {
      const langRes: Record<string, unknown> = {};
      resources[lang] = langRes;
      await Promise.all(
        NAMESPACES.map(async (ns) => {
          langRes[ns] = await loadLocale(lang, ns);
        }),
      );
    }),
  );

  await i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: resources as Resource,
      fallbackLng: 'en',
      supportedLngs: SUPPORTED_LNGS,
      ns: NAMESPACES,
      defaultNS: 'common',
      detection: {
        order: ['localStorage', 'navigator'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18nextLng',
      },
      interpolation: {
        escapeValue: false,
      },
    });
}
