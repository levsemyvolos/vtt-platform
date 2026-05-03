import { useTranslation } from 'react-i18next';
import { Logo } from '../../components/ui';
import Button from '../../components/ui/Button';
import ThemeToggle from '../../components/Header/ThemeToggle';
import LanguageSwitcher from '../../components/Header/LanguageSwitcher';
import styles from './Landing.module.css';

type AuthView = 'login' | 'register' | 'observer';

interface LandingProps {
  onNavigate: (view: AuthView) => void;
}

const FEATURES = [
  { key: 'realtime', icon: '🗺️' },
  { key: 'ai', icon: '🤖' },
  { key: 'tools', icon: '🎲' },
] as const;

export default function Landing({ onNavigate }: LandingProps): JSX.Element {
  const { t } = useTranslation('landing');

  return (
    <div className={styles.page}>
      <div className={styles.topControls}>
        <LanguageSwitcher />
        <ThemeToggle />
      </div>

      <section className={styles.hero}>
        <div className={styles.logoWrap}>
          <Logo size={56} />
          <span className={styles.logoText}>{t('hero.title')}</span>
        </div>
        <p className={styles.subtitle}>{t('hero.subtitle')}</p>
        <div className={styles.ctaRow}>
          <Button
            variant="primary"
            size="lg"
            onClick={() => onNavigate('register')}
          >
            {t('cta.register')}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => onNavigate('login')}
          >
            {t('cta.login')}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => onNavigate('observer')}
          >
            {t('cta.observer')}
          </Button>
        </div>
      </section>

      <section className={styles.features}>
        {FEATURES.map(({ key, icon }) => (
          <div key={key} className={styles.featureCard}>
            <span className={styles.featureIcon} aria-hidden="true">{icon}</span>
            <h3 className={styles.featureTitle}>{t(`features.${key}.title`)}</h3>
            <p className={styles.featureDesc}>{t(`features.${key}.desc`)}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>{t('footer')}</footer>
    </div>
  );
}
