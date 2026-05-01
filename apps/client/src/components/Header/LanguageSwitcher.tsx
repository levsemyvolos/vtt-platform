import { useTranslation } from 'react-i18next';
import styles from './Header.module.css';

const LANGS = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'uk', flag: '🇺🇦', label: 'Українська' },
] as const;

type LangCode = (typeof LANGS)[number]['code'];

export default function LanguageSwitcher(): JSX.Element {
  const { i18n } = useTranslation();
  const current = i18n.language?.startsWith('uk') ? 'uk' : 'en';

  function handleChange(code: LangCode): void {
    void i18n.changeLanguage(code);
  }

  return (
    <div className={styles.langSwitcher} role="group" aria-label="Language">
      {LANGS.map(({ code, flag, label }) => (
        <button
          key={code}
          type="button"
          className={current === code ? `${styles.btn} ${styles.btnActive}` : styles.btn}
          onClick={() => handleChange(code)}
          title={label}
          aria-pressed={current === code}
          aria-label={label}
        >
          {flag}
        </button>
      ))}
    </div>
  );
}
