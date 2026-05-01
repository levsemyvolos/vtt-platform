import { useTranslation } from 'react-i18next';
import styles from './MeshCeilingBanner.module.css';

/** Shown to all participants when active peer count reaches the mesh ceiling (N > 6). */
export default function MeshCeilingBanner(): JSX.Element {
  const { t } = useTranslation('room');
  return (
    <div className={styles.banner} role="alert" aria-live="polite">
      <span className={styles.icon} aria-hidden="true">⚠</span>
      {t('mesh.ceiling')}
    </div>
  );
}
