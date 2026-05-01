import { useTranslation } from 'react-i18next';
import styles from './EditorToolbarRight.module.css';

export default function EditorToolbarRight(): JSX.Element {
  const { t } = useTranslation('room');
  return (
    <aside className={styles.toolbar} aria-label={t('sceneEditor.rightToolbar.heading')}>
      <p className={styles.heading}>{t('sceneEditor.rightToolbar.heading')}</p>
      <p className={styles.empty}>{t('sceneEditor.placeholder')}</p>
    </aside>
  );
}
