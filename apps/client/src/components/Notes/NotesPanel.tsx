import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  createNoteThunk,
  deleteNoteThunk,
  loadNotes,
  setCurrentNote,
  updateNoteThunk,
} from '../../store/notes';

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
    <section className="notes-panel" aria-label={t('campaign:notes.panelAriaLabel')}>
      <aside className="notes-panel__list">
        <header className="notes-panel__list-header">
          <h3>{t('campaign:notes.heading')}</h3>
          <button type="button" onClick={onCreateNew} aria-label={t('campaign:notes.createAriaLabel')}>
            {t('campaign:notes.createBtn')}
          </button>
        </header>
        <ul>
          {items.map((n) => (
            <li
              key={n.id}
              className={current?.id === n.id ? 'notes-panel__list-item--active' : ''}
            >
              <button type="button" onClick={() => dispatch(setCurrentNote(n))}>
                {n.title || t('campaign:notes.untitled')}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="notes-panel__editor">
        {!current ? (
          <p className="notes-panel__empty">{t('campaign:notes.emptySelect')}</p>
        ) : (
          <>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              aria-label={t('campaign:notes.titleLabel')}
              className="notes-panel__title"
            />
            <div className="notes-panel__split">
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                aria-label={t('campaign:notes.bodyLabel')}
                className="notes-panel__textarea"
              />
              <div className="notes-panel__preview" aria-label={t('campaign:notes.previewLabel')}>
                <ReactMarkdown>{draftBody}</ReactMarkdown>
              </div>
            </div>
            <div className="notes-panel__actions">
              <button type="button" onClick={onSave}>{t('common:btn.save')}</button>
              <button type="button" onClick={onDelete} className="notes-panel__delete">
                {t('common:btn.delete')}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
