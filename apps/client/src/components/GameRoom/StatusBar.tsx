import { useTranslation } from 'react-i18next';
import { useAppSelector } from '../../store';
import styles from './StatusBar.module.css';

export default function StatusBar(): JSX.Element {
  const { t } = useTranslation('gameroom');
  const scene = useAppSelector((s) => s.scene.current);

  const sceneName = scene?.name ?? t('statusBar.noScene');
  const gridSize = scene ? `${scene.gridWidth}×${scene.gridHeight}` : t('statusBar.noScene');
  const tokenCount = scene?.tokens.length ?? 0;
  const fowOn = scene ? (scene.fogShapes?.length ?? 0) > 0 : false;

  return (
    <footer
      className={styles.bar}
      aria-live="polite"
      aria-label={t('statusBar.ariaLabel')}
    >
      <span className={styles.item}>
        <span className={styles.label}>{t('statusBar.scene')}: </span>
        <span className={styles.value}>{sceneName}</span>
      </span>
      <span className={styles.sep} aria-hidden>&middot;</span>
      <span className={styles.item}>
        <span className={styles.label}>{t('statusBar.grid')}: </span>
        <span className={styles.value}>{gridSize}</span>
      </span>
      <span className={styles.sep} aria-hidden>&middot;</span>
      <span className={styles.item}>
        <span className={styles.label}>{t('statusBar.tokens')}: </span>
        <span className={styles.value}>{tokenCount}</span>
      </span>
      <span className={styles.sep} aria-hidden>&middot;</span>
      <span className={styles.item}>
        <span className={styles.label}>{t('statusBar.light')}: </span>
        <span className={styles.value}>
          {fowOn ? t('statusBar.fowOn') : t('statusBar.fowOff')}
        </span>
      </span>
      <span className={styles.sep} aria-hidden>&middot;</span>
      <span className={styles.item}>
        <span className={styles.label}>{t('statusBar.autosave')}</span>
      </span>
    </footer>
  );
}
