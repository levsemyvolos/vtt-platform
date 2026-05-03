import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import type { Role } from '@vtt/shared';
import styles from './NotesPanel.module.css';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  createNoteThunk,
  deleteNoteThunk,
  loadNotes,
  setCurrentNote,
  updateNoteThunk,
} from '../../store/notes';
import { Button } from '../ui';

interface NotesPanelProps {
  roomId: string;
  myRole: Role;
}

export default function NotesPanel({ roomId, myRole }: NotesPanelProps): JSX.Element | null {
  const { t } = useTranslation(['campaign', 'common']);
  const dispatch = useAppDispatch();
  const items = useAppSelector((s) => s.notes.items);
  const current = useAppSelector((s) => s.notes.current);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');

  useEffect(() => {
    if (myRole !== 'GM') return;
    void dispatch(loadNotes(roomId));
  }, [roomId, myRole, dispatch]);

  useEffect(() => {
    if (current) {
      setDraftTitle(current.title);
      setDraftBody(current.body);
    } else {
      setDraftTitle('');
      setDraftBody('');
    }
  }, [current]);

  if (myRole !== 'GM') return null;

  function onCreateNew(): void {
    void dispatch(
      createNoteThunk({ roomId, req: { title: t('campaign:notes.newNoteTitle'), body: '' } }),
    );
  }

  function onSave(): void {
    if (!current) return;
    void dispatch(
      updateNoteThunk({ id: current.id, req: { title: draftTitle, body: draftBody } }),
    );
  }

  function onDelete(): void {
    if (!current) return;
    void dispatch(deleteNoteThunk(current.id));
  }

  return (
    <section className={styles.panel} aria-label={t('campaign:notes.panelAriaLabel')}>
      <aside className={styles.list}>
        <header className={styles.listHeader}>
          <span className={`eyebrow ${styles.eyebrow}`}>
            {t('campaign:notes.heading')} · GM
          </span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onCreateNew}
            aria-label={t('campaign:notes.createAriaLabel')}
          >
            {t('campaign:notes.createBtn')}
          </Button>
        </header>
        <ul className={styles.listItems}>
          {items.map((n) => (
            <li
              key={n.id}
              className={current?.id === n.id ? `${styles.listItem} ${styles.listItemActive}` : styles.listItem}
            >
              <button type="button" onClick={() => dispatch(setCurrentNote(n))}>
                {n.title || t('campaign:notes.untitled')}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className={styles.editor}>
        {!current ? (
          <p className={styles.empty}>{t('campaign:notes.emptySelect')}</p>
        ) : (
          <>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              aria-label={t('campaign:notes.titleLabel')}
              className={styles.titleInput}
              maxLength={100}
            />
            <div className={styles.split}>
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                aria-label={t('campaign:notes.bodyLabel')}
                className={styles.textarea}
              />
              <div className={styles.preview} aria-label={t('campaign:notes.previewLabel')}>
                <ReactMarkdown>{draftBody}</ReactMarkdown>
              </div>
            </div>
            <div className={styles.editorActions}>
              <Button type="button" variant="primary" size="sm" onClick={onSave}>
                {t('common:btn.save')}
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={onDelete}>
                {t('common:btn.delete')}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
