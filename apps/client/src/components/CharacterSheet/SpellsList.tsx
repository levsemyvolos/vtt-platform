import { useState, type FormEvent } from 'react';

export interface SpellEntry {
  name: string;
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  description: string;
}

interface SpellsListProps {
  spells: SpellEntry[];
  readOnly: boolean;
  onChange: (spells: SpellEntry[]) => void;
}

/**
 * Мінімальний список заклинань D&D 5e (R-Spells-Minimal). Підтримує
 * Add / Edit / Delete по кожному заклинанню; slots/components/ritual —
 * у R-Spells-Full (Roadmap).
 */
export default function SpellsList({ spells, readOnly, onChange }: SpellsListProps): JSX.Element {
  const [editing, setEditing] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<SpellEntry>({ name: '', level: 0, description: '' });

  function openAdd(): void {
    setForm({ name: '', level: 0, description: '' });
    setAddOpen(true);
    setEditing(null);
  }

  function openEdit(idx: number): void {
    const spell = spells[idx];
    if (!spell) return;
    setForm({ name: spell.name, level: spell.level, description: spell.description });
    setEditing(idx);
    setAddOpen(false);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    if (!form.name.trim()) return;
    const entry: SpellEntry = {
      name: form.name.trim(),
      level: form.level,
      description: form.description.trim(),
    };
    if (editing !== null) {
      onChange(spells.map((s, i) => (i === editing ? entry : s)));
      setEditing(null);
    } else {
      onChange([...spells, entry]);
      setAddOpen(false);
    }
  }

  function onDelete(idx: number): void {
    onChange(spells.filter((_, i) => i !== idx));
    if (editing === idx) setEditing(null);
  }

  return (
    <fieldset className="spells-list">
      <legend>Spells</legend>
      {spells.length === 0 && <p className="spells-list__empty">Заклинань немає.</p>}
      <ul className="spells-list__items">
        {spells.map((spell, idx) => (
          <li key={idx} className="spells-list__item">
            <span className="spells-list__name">{spell.name}</span>
            <span className="spells-list__level">Lv.{spell.level}</span>
            {spell.description && (
              <span className="spells-list__desc">{spell.description}</span>
            )}
            {!readOnly && (
              <>
                <button
                  type="button"
                  onClick={() => openEdit(idx)}
                  aria-label={`Редагувати ${spell.name}`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(idx)}
                  aria-label={`Видалити ${spell.name}`}
                >
                  ×
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {!readOnly && (editing !== null || addOpen) && (
        <form onSubmit={onSubmit} className="spells-list__form">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Назва"
            aria-label="Назва заклинання"
            required
          />
          <select
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) as SpellEntry['level'] }))}
            aria-label="Рівень заклинання"
          >
            {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((l) => (
              <option key={l} value={l}>
                {l === 0 ? 'Cantrip' : `Level ${l}`}
              </option>
            ))}
          </select>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Опис (необов'язково)"
            aria-label="Опис заклинання"
            rows={2}
          />
          <button type="submit">{editing !== null ? 'Зберегти' : 'Додати'}</button>
          <button
            type="button"
            onClick={() => { setEditing(null); setAddOpen(false); }}
          >
            Скасувати
          </button>
        </form>
      )}

      {!readOnly && !addOpen && editing === null && (
        <button type="button" onClick={openAdd} className="spells-list__add">
          + Заклинання
        </button>
      )}
    </fieldset>
  );
}
