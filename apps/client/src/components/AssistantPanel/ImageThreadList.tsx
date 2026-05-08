import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssistantImageConversationDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  setActiveImageConversationId,
  fetchImageConversations,
  createImageConv,
  renameImageConv,
  deleteImageConv,
} from '../../store/imageAssistant';
import styles from './ImageThreadList.module.css';

interface ImageThreadListProps {
  roomId: string;
}

interface ImageThreadRowProps {
  conv: AssistantImageConversationDTO;
  isActive: boolean;
  onSelect: (id: string) => void;
  onRename: (conv: AssistantImageConversationDTO) => void;
  onDelete: (conv: AssistantImageConversationDTO) => void;
  renameLabel: string;
  deleteLabel: string;
}

function ImageThreadRow({
  conv,
  isActive,
  onSelect,
  onRename,
  onDelete,
  renameLabel,
  deleteLabel,
}: ImageThreadRowProps): JSX.Element {
  return (
    <li className={`${styles.row}${isActive ? ` ${styles.rowActive}` : ''}`}>
      <button
        type="button"
        aria-selected={isActive}
        className={styles.rowMain}
        onClick={() => onSelect(conv.id)}
      >
        <span className={styles.rowTitle}>{conv.title}</span>
        <span className={styles.rowMeta}>
          {new Date(conv.updatedAt).toLocaleDateString()}
        </span>
      </button>
      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.rowActionBtn}
          aria-label={renameLabel}
          title={renameLabel}
          onClick={() => onRename(conv)}
        >
          ✏
        </button>
        <button
          type="button"
          className={styles.rowActionBtn}
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={() => onDelete(conv)}
        >
          🗑
        </button>
      </div>
    </li>
  );
}

export default function ImageThreadList({ roomId }: ImageThreadListProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('assistant');
  const conversationsMap = useAppSelector((s) => s.imageAssistant.conversations);
  const activeConversationId = useAppSelector((s) => s.imageAssistant.activeConversationId);

  // Fetch on mount per room.
  useEffect(() => {
    void dispatch(fetchImageConversations({ roomId }));
  }, [dispatch, roomId]);

  // Filter + sort by updatedAt desc.
  const threads = useMemo<AssistantImageConversationDTO[]>(() => {
    return Object.values(conversationsMap)
      .filter((c) => c.roomId === roomId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [conversationsMap, roomId]);

  // Auto-select first when current active doesn't belong to this room or is null.
  useEffect(() => {
    const activeMeta = activeConversationId ? conversationsMap[activeConversationId] : null;
    const valid = activeMeta && activeMeta.roomId === roomId;
    if (!valid) {
      dispatch(setActiveImageConversationId(threads[0]?.id ?? null));
    }
  }, [threads, activeConversationId, conversationsMap, roomId, dispatch]);

  function handleNew(): void {
    void dispatch(createImageConv({ roomId }));
  }

  function handleSelect(id: string): void {
    dispatch(setActiveImageConversationId(id));
  }

  function handleRename(conv: AssistantImageConversationDTO): void {
    const next = window.prompt(t('imageThreadList.renamePrompt'), conv.title);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === conv.title) return;
    void dispatch(renameImageConv({ id: conv.id, title: trimmed }));
  }

  function handleDelete(conv: AssistantImageConversationDTO): void {
    const ok = window.confirm(t('imageThreadList.deleteConfirm', { title: conv.title }));
    if (!ok) return;
    void dispatch(deleteImageConv({ id: conv.id }));
  }

  return (
    <aside className={styles.imageThreadList}>
      <button type="button" className={styles.newBtn} onClick={handleNew}>
        {t('imageThreadList.newBtn')}
      </button>
      <ul className={styles.list} aria-label={t('imageThreadList.listLabel')}>
        {threads.length === 0 && (
          <li className={styles.empty}>{t('imageThreadList.empty')}</li>
        )}
        {threads.map((c) => (
          <ImageThreadRow
            key={c.id}
            conv={c}
            isActive={c.id === activeConversationId}
            onSelect={handleSelect}
            onRename={handleRename}
            onDelete={handleDelete}
            renameLabel={t('imageThreadList.renameLabel')}
            deleteLabel={t('imageThreadList.deleteLabel')}
          />
        ))}
      </ul>
    </aside>
  );
}
