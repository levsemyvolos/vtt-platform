import { useEffect, useState } from 'react';
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

/**
 * Приватні нотатки GM (Ф9). Двопанельний редактор: textarea + Markdown-preview.
 * Доступна лише користувачам з роллю GM.
 */
export default function NotesPanel({ roomId, myRole }: NotesPanelProps): JSX.Element | null {
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
      createNoteThunk({ roomId, req: { title: 'Нова нотатка', body: '' } }),
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
    <section className="notes-panel" aria-label="GM notes">
      <aside className="notes-panel__list">
        <header className="notes-panel__list-header">
          <h3>Нотатки</h3>
          <button type="button" onClick={onCreateNew} aria-label="Створити нотатку">
            + Створити
          </button>
        </header>
        <ul>
          {items.map((n) => (
            <li
              key={n.id}
              className={current?.id === n.id ? 'notes-panel__list-item--active' : ''}
            >
              <button type="button" onClick={() => dispatch(setCurrentNote(n))}>
                {n.title || '(без назви)'}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="notes-panel__editor">
        {!current ? (
          <p className="notes-panel__empty">Оберіть або створіть нотатку.</p>
        ) : (
          <>
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              aria-label="Заголовок нотатки"
              className="notes-panel__title"
            />
            <div className="notes-panel__split">
              <textarea
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                aria-label="Текст нотатки (Markdown)"
                className="notes-panel__textarea"
              />
              <div className="notes-panel__preview" aria-label="Markdown preview">
                <ReactMarkdown>{draftBody}</ReactMarkdown>
              </div>
            </div>
            <div className="notes-panel__actions">
              <button type="button" onClick={onSave}>Зберегти</button>
              <button type="button" onClick={onDelete} className="notes-panel__delete">
                Видалити
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
