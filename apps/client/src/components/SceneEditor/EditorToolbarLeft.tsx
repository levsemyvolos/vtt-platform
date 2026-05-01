import { useTranslation } from 'react-i18next';
import styles from './EditorToolbarLeft.module.css';

export default function EditorToolbarLeft(): JSX.Element {
  const { t } = useTranslation('room');

  const sections = [
    { key: 'background', label: t('sceneEditor.leftToolbar.background') },
    { key: 'grid',       label: t('sceneEditor.leftToolbar.grid') },
    { key: 'tokens',     label: t('sceneEditor.leftToolbar.tokens') },
    { key: 'fog',        label: t('sceneEditor.leftToolbar.fog') },
  ];

  return (
    <aside className={styles.toolbar} aria-label={t('sceneEditor.leftToolbar.label')}>
      {sections.map(({ key, label }) => (
        <section key={key} className={styles.section} data-section={key}>
          <p className={styles.heading}>{label}</p>
          <div className={styles.placeholder} />
        </section>
      ))}
    </aside>
  );
}
