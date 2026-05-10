import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ConfirmModal from '../common/ConfirmModal';
import type { AssistantContext, AssistantConversationDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  setActiveContext,
  setActiveConversationId,
  fetchConversations,
  createConversation,
  renameConversation,
  deleteConversation,
  fetchConversationMessages,
} from '../../store/assistant';
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
  const activeConversationId = useAppSelector((s) => s.assistant.activeConversationId);
  const conversationsMap = useAppSelector((s) => s.assistant.conversations);
  const messagesLoaded = useAppSelector((s) => s.assistant.messagesLoaded);
  const [pendingDelete, setPendingDelete] = useState<AssistantConversationDTO | null>(null);

  // Fetch conversations once per room.
  useEffect(() => {
    void dispatch(fetchConversations({ roomId }));
  }, [dispatch, roomId]);

  // Threads filtered by current room + context, newest-first.
  const threads = useMemo<AssistantConversationDTO[]>(() => {
    return Object.values(conversationsMap)
      .filter((c) => c.roomId === roomId && c.context === activeContext)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [conversationsMap, roomId, activeContext]);

  // Auto-select first thread when filter changes, if none active or active belongs to other context.
  useEffect(() => {
    const activeMeta = activeConversationId ? conversationsMap[activeConversationId] : null;
    const stillValid = activeMeta && activeMeta.roomId === roomId && activeMeta.context === activeContext;
    if (!stillValid) {
      const first = threads[0]?.id ?? null;
      dispatch(setActiveConversationId(first));
    }
  }, [threads, activeConversationId, conversationsMap, roomId, activeContext, dispatch]);

  // When active conversation changes, lazy-fetch its messages.
  useEffect(() => {
    if (activeConversationId && !messagesLoaded[activeConversationId]) {
      void dispatch(fetchConversationMessages({ conversationId: activeConversationId }));
    }
  }, [activeConversationId, messagesLoaded, dispatch]);

  function handleNew(): void {
    void dispatch(createConversation({ roomId, context: activeContext }));
  }

  function handleSelect(id: string): void {
    dispatch(setActiveConversationId(id));
  }

  function handleRename(conv: AssistantConversationDTO): void {
    const next = window.prompt(t('dialogList.renamePrompt'), conv.title);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === conv.title) return;
    void dispatch(renameConversation({ id: conv.id, title: trimmed }));
  }

  function handleDelete(conv: AssistantConversationDTO): void {
    setPendingDelete(conv);
  }

  return (
    <aside className={styles.dialogList}>
      <ConfirmModal
        open={pendingDelete !== null}
        title={t('dialogList.deleteLabel')}
        message={t('dialogList.deleteConfirm', { title: pendingDelete?.title ?? '' })}
        confirmLabel={t('common:btn.delete')}
        variant="danger"
        onConfirm={() => {
          if (pendingDelete) void dispatch(deleteConversation({ id: pendingDelete.id }));
          setPendingDelete(null);
        }}
        onClose={() => setPendingDelete(null)}
      />
      <div className={styles.filterBar} role="tablist" aria-label={t('dialogList.filterLabel')}>
        {CONTEXTS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeContext === id}
            className={`${styles.filterChip}${activeContext === id ? ` ${styles.filterChipActive}` : ''}`}
            onClick={() => dispatch(setActiveContext(id))}
          >
            {t(`context.${id}`)}
          </button>
        ))}
      </div>

      <button type="button" className={styles.newBtn} onClick={handleNew}>
        {t('dialogList.newBtn')}
      </button>

      <ul className={styles.list} aria-label={t('dialogList.listLabel')}>
        {threads.length === 0 && (
          <li className={styles.empty}>{t('dialogList.empty')}</li>
        )}
        {threads.map((c) => {
          const isActive = c.id === activeConversationId;
          return (
            <li key={c.id} className={`${styles.row}${isActive ? ` ${styles.rowActive}` : ''}`}>
              <button
                type="button"
                aria-selected={isActive}
                className={styles.rowMain}
                onClick={() => handleSelect(c.id)}
              >
                <span className={styles.rowTitle}>{c.title}</span>
                <span className={styles.rowMeta}>
                  {new Date(c.updatedAt).toLocaleDateString()}
                </span>
              </button>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  className={styles.rowActionBtn}
                  aria-label={t('dialogList.renameLabel')}
                  title={t('dialogList.renameLabel')}
                  onClick={() => handleRename(c)}
                >
                  ✏
                </button>
                <button
                  type="button"
                  className={styles.rowActionBtn}
                  aria-label={t('dialogList.deleteLabel')}
                  title={t('dialogList.deleteLabel')}
                  onClick={() => handleDelete(c)}
                >
                  🗑
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
