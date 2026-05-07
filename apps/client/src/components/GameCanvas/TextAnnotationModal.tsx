import { useState } from 'react';
import Modal from '../common/Modal';
import { apiAddTextAnnotation } from '../../api/scenes';
import { store } from '../../store';
import { recordUndo } from '../../store/undoDispatcher';

interface Props {
  sceneId: string;
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * GM modal for pinning a text label on the canvas at (x, y) (Ф3.4.4).
 * Submits POST /scenes/:id/annotations/text; the server broadcasts
 * scene:updated so the label appears for all clients.
 */
export default function TextAnnotationModal({ sceneId, x, y, onClose }: Props): JSX.Element {
  const [text, setText] = useState('');
  const [color, setColor] = useState('#ffffff');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      // Sess 7.5: capture id-set before so we can recognize the newly-created
      // text object in the response (server generates the id; broadcast is what
      // updates state, but the response itself carries the canonical annotations).
      const beforeIds = new Set(
        (store.getState().scene.current?.annotations.objects ?? []).map((o) => o.id),
      );
      const result = await apiAddTextAnnotation(sceneId, { x, y, text: text.trim(), color });
      const newObj = (result.objects ?? []).find((o) => !beforeIds.has(o.id) && o.type === 'text');
      if (newObj) recordUndo({ kind: 'object_add', object: newObj });
    } finally {
      setSubmitting(false);
      onClose();
    }
  }

  return (
    <Modal title="Додати текстову позначку" onClose={onClose}>
      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.875rem' }}>
          Текст
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Позначка…"
            autoFocus
            required
            style={{ padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border, #444)', background: 'var(--color-surface-2, #1e2535)', color: 'inherit' }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
          Колір
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: '36px', height: '28px', padding: '0', border: 'none', background: 'none', cursor: 'pointer' }}
          />
          <span style={{ color: 'var(--color-muted, #888)', fontSize: '0.75rem' }}>
            x:{Math.round(x)} y:{Math.round(y)}
          </span>
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
          <button type="button" onClick={onClose} style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: '1px solid var(--color-border, #444)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
            Скасувати
          </button>
          <button
            type="submit"
            disabled={submitting || !text.trim()}
            style={{ padding: '0.4rem 1rem', borderRadius: '4px', border: 'none', background: 'var(--color-primary, #7c5cff)', color: '#fff', cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Додаю…' : 'Додати'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
