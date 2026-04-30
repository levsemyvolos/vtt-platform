import i18next from 'i18next';
import { initI18n } from './i18n';

if (!i18next.isInitialized) {
  await initI18n();
}
await i18next.changeLanguage('uk');
