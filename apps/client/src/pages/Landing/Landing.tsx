import { useTranslation } from 'react-i18next';
import type { ComponentType } from 'react';
import { Map, Sparkles, Dices, type LucideProps } from 'lucide-react';
import { Logo } from '../../components/ui';
import ThemeToggle from '../../components/Header/ThemeToggle';
import LanguageSwitcher from '../../components/Header/LanguageSwitcher';
import styles from './Landing.module.css';

type AuthView = 'login' | 'register' | 'observer' | 'join-observer';

interface LandingProps {
  onNavigate: (view: AuthView) => void;
}

interface Feature {
  key: 'realtime' | 'ai' | 'tools';
  Icon: ComponentType<LucideProps>;
}

const FEATURES: ReadonlyArray<Feature> = [
  { key: 'realtime', Icon: Map },
  { key: 'ai', Icon: Sparkles },
  { key: 'tools', Icon: Dices },
];

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
          <Logo size={56} withText={false} />
        </div>
        <h1 className={styles.heroTitle}>{t('hero.title')}</h1>
        <p className={styles.subtitle}>{t('hero.subtitle')}</p>
        <div className={styles.ctaRow}>
          <button
            type="button"
            className="glass-btn glass-btn-faint glass-btn-primary"
            onClick={() => onNavigate('register')}
          >
            {t('cta.register')}
          </button>
          <button
            type="button"
            className="glass-btn glass-btn-faint"
            onClick={() => onNavigate('login')}
          >
            {t('cta.login')}
          </button>
          <button
            type="button"
            className="glass-btn glass-btn-ghost"
            onClick={() => onNavigate('join-observer')}
          >
            {t('cta.observer')}
          </button>
        </div>
      </section>

      <section className={styles.features}>
        {FEATURES.map(({ key, Icon }) => (
          <div key={key} className={`glass glass-faint ${styles.featureCard}`}>
            <span className={styles.featureIcon} aria-hidden="true">
              <Icon size={28} strokeWidth={1.5} className="icon-accent" />
            </span>
            <h3 className={styles.featureTitle}>{t(`features.${key}.title`)}</h3>
            <p className={styles.featureDesc}>{t(`features.${key}.desc`)}</p>
          </div>
        ))}
      </section>

      <footer className={styles.footer}>{t('footer')}</footer>
    </div>
  );
}
