import { useTranslation } from 'react-i18next';
import styles from './Logo.module.css';

export interface LogoProps {
  /** Height of the sigil in px. Nav default: 40. Auth/Landing: 180. */
  size?: number;
  /** Show "Obscure VTT" text + meta line next to the sigil. */
  withText?: boolean;
  /** @deprecated — use size. Kept for call-site compat. */
  withDot?: boolean;
}

export default function Logo({ size = 40, withText = true }: LogoProps) {
  const { t } = useTranslation('common');
  return (
    <div className={styles.brand} role="img" aria-label={t('logo.ariaLabel')}>
      <div className={styles.sigil} style={{ width: size, height: size }}>
        <OracleSvg className={styles.oracle} />
        <CounselorSvg className={styles.counselor} />
      </div>
      {withText && (
        <div className={styles.text}>
          <div className={styles.name}>
            Obscure <em>VTT</em>
          </div>
          <div className={styles.meta}>{t('logo.subtitle')}</div>
        </div>
      )}
    </div>
  );
}

function OracleSvg({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="oracleCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE39A" />
          <stop offset="60%" stopColor="#F0C560" />
          <stop offset="100%" stopColor="#C89B3C" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="86" fill="none" stroke="#C89B3C" strokeOpacity="0.5" strokeWidth="1.4" />
      <circle cx="100" cy="100" r="86" fill="none" stroke="#C89B3C" strokeOpacity="0.9" strokeWidth="1.6" strokeDasharray="2 22" />
      <circle cx="100" cy="14" r="3" fill="#F0C560" />
      <circle cx="186" cy="100" r="3" fill="#F0C560" />
      <circle cx="100" cy="186" r="3" fill="#F0C560" />
      <circle cx="14" cy="100" r="3" fill="#F0C560" />
      <g stroke="#C89B3C" strokeOpacity="0.6" strokeWidth="1.2">
        <line x1="100" y1="22" x2="100" y2="42" />
        <line x1="100" y1="158" x2="100" y2="178" />
        <line x1="22" y1="100" x2="42" y2="100" />
        <line x1="158" y1="100" x2="178" y2="100" />
        <line x1="44" y1="44" x2="58" y2="58" strokeOpacity="0.4" />
        <line x1="156" y1="44" x2="142" y2="58" strokeOpacity="0.4" />
        <line x1="44" y1="156" x2="58" y2="142" strokeOpacity="0.4" />
        <line x1="156" y1="156" x2="142" y2="142" strokeOpacity="0.4" />
      </g>
      <circle cx="100" cy="100" r="60" fill="none" stroke="#F0C560" strokeOpacity="0.7" strokeWidth="1.2" strokeDasharray="4 5" />
      <circle cx="100" cy="100" r="60" fill="none" stroke="#5A7BA8" strokeOpacity="0.35" strokeWidth="0.8" strokeDasharray="1 9" />
      <g stroke="#C89B3C" strokeOpacity="0.55" strokeWidth="1.2" fill="none">
        <polygon points="100,52 144,124 56,124" />
        <polygon points="100,148 56,76 144,76" strokeOpacity="0.3" />
      </g>
      <circle cx="100" cy="100" r="22" fill="url(#oracleCore)" />
      <circle cx="100" cy="100" r="6" fill="#FFF6D8" />
    </svg>
  );
}

function CounselorSvg({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 220 220" className={className} aria-hidden="true">
      <defs>
        <radialGradient id="cnsCore" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFE9B0" />
          <stop offset="55%" stopColor="#C8932A" />
          <stop offset="100%" stopColor="#9A6E1A" stopOpacity="0.3" />
        </radialGradient>
      </defs>
      <g stroke="#9A6E1A" strokeOpacity="0.5" strokeWidth="1.2">
        <line x1="110" y1="14" x2="110" y2="34" />
        <line x1="110" y1="186" x2="110" y2="206" />
        <line x1="14" y1="110" x2="34" y2="110" />
        <line x1="186" y1="110" x2="206" y2="110" />
        <line x1="42" y1="42" x2="56" y2="56" />
        <line x1="178" y1="42" x2="164" y2="56" />
        <line x1="42" y1="178" x2="56" y2="164" />
        <line x1="178" y1="178" x2="164" y2="164" />
        <line x1="110" y1="38" x2="110" y2="50" strokeOpacity="0.3" />
        <line x1="110" y1="170" x2="110" y2="182" strokeOpacity="0.3" />
      </g>
      <g fill="none" stroke="#9A6E1A" strokeWidth="1.4" strokeOpacity="0.7">
        <ellipse cx="110" cy="62" rx="14" ry="34" />
        <ellipse cx="110" cy="158" rx="14" ry="34" />
        <ellipse cx="62" cy="110" rx="34" ry="14" />
        <ellipse cx="158" cy="110" rx="34" ry="14" />
        <g transform="rotate(45 110 110)">
          <ellipse cx="110" cy="62" rx="11" ry="28" strokeOpacity="0.5" />
          <ellipse cx="110" cy="158" rx="11" ry="28" strokeOpacity="0.5" />
          <ellipse cx="62" cy="110" rx="28" ry="11" strokeOpacity="0.5" />
          <ellipse cx="158" cy="110" rx="28" ry="11" strokeOpacity="0.5" />
        </g>
      </g>
      <circle cx="110" cy="110" r="44" fill="none" stroke="#C8932A" strokeOpacity="0.55" strokeWidth="1.2" strokeDasharray="3 6" />
      <circle cx="110" cy="110" r="22" fill="url(#cnsCore)" />
      <circle cx="110" cy="110" r="6" fill="#FFFAE0" />
    </svg>
  );
}
