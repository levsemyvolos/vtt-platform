import { useTranslation } from 'react-i18next';
import type { AssistantContext } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { setActiveContext, clearConversation } from '../../store/assistant';
import styles from './DialogList.module.css';

interface DialogListProps {
  roomId: string;
}

const CONTEXTS: ReadonlyArray<AssistantContext> = [
  'npc-description',
  'scene-description',
  'srd-lookup',
  'free-chat',
];

export default function DialogList({ roomId }: DialogListProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('assistant');
  const activeContext = useAppSelector((s) => s.assistant.activeContext);

  function handleNew() {
    dispatch(clearConversation(`${roomId}:${activeContext}`));
  }

  return (
    <aside className={styles.dialogList}>
      <button type="button" className={styles.newBtn} onClick={handleNew}>
        {t('dialogList.newBtn')}
      </button>
      <ul className={styles.list} aria-label={t('dialogList.listLabel')}>
        {CONTEXTS.map((id) => (
          <li key={id}>
            <button
              type="button"
              aria-selected={activeContext === id}
              className={`${styles.item}${activeContext === id ? ` ${styles.itemActive}` : ''}`}
              onClick={() => dispatch(setActiveContext(id))}
            >
              {t(`context.${id}`)}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
