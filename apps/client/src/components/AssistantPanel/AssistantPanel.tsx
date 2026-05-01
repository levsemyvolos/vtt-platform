import { useTranslation } from 'react-i18next';
import type { AssistantContext, ConversationMessage } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { sendAssistantMessage, setActiveContext } from '../../store/assistant';
import MessageList from './MessageList';
import InputBar from './InputBar';
import styles from './AssistantPanel.module.css';

const EMPTY_MESSAGES: ConversationMessage[] = [];
const TAB_IDS: AssistantContext[] = ['npc-description', 'scene-description', 'srd-lookup', 'free-chat'];

interface AssistantPanelProps {
  roomId: string;
  onClose: () => void;
}

export default function AssistantPanel({ roomId, onClose }: AssistantPanelProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['assistant', 'errors']);
  const activeContext = useAppSelector((s) => s.assistant.activeContext);
  const status = useAppSelector((s) => s.assistant.status);
  const error = useAppSelector((s) => s.assistant.error);
  const conversationId = `${roomId}:${activeContext}`;
  const messages = useAppSelector((s) => s.assistant.conversations[conversationId] ?? EMPTY_MESSAGES);

  return (
    <div className={styles.panel} role="dialog" aria-label={t('panel.dialogLabel')}>
      <div className={styles.header}>
        <span className={styles.title}>{t('panel.title')}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('panel.closeLabel')}
        >
          ✕
        </button>
      </div>
      <nav className={styles.tabs} role="tablist">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeContext === id}
            className={`${styles.tab}${activeContext === id ? ` ${styles.tabActive}` : ''}`}
            onClick={() => dispatch(setActiveContext(id))}
          >
            {t(`context.${id}`)}
          </button>
        ))}
      </nav>
      <MessageList messages={messages} />
      {error && status === 'error' && (
        <p className={styles.error} role="alert">
          {error.startsWith('errors:') ? t(error as never) : error}
        </p>
      )}
      <InputBar
        onSend={(prompt) => void dispatch(sendAssistantMessage({ context: activeContext, prompt, conversationId }))}
        disabled={status === 'sending'}
      />
    </div>
  );
}
