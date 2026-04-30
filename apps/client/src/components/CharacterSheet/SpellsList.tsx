import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

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

export default function SpellsList({ spells, readOnly, onChange }: SpellsListProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
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
      <legend>{t('campaign:character.spells')}</legend>
      {spells.length === 0 && (
        <p className="spells-list__empty">{t('campaign:character.spellsEmpty')}</p>
      )}
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
                  aria-label={t('campaign:character.spellEditLabel', { name: spell.name })}
                >
                  ✎
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(idx)}
                  aria-label={t('campaign:character.spellDeleteLabel', { name: spell.name })}
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
            placeholder={t('campaign:character.spellNameLabel')}
            aria-label={t('campaign:character.spellNameLabel')}
            required
          />
          <select
            value={form.level}
            onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) as SpellEntry['level'] }))}
            aria-label={t('campaign:character.spellLevelLabel')}
          >
            {([0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const).map((l) => (
              <option key={l} value={l}>
                {l === 0
                  ? t('campaign:character.spellCantrip')
                  : t('campaign:character.spellLevel', { level: l })}
              </option>
            ))}
          </select>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder={t('campaign:character.spellDescPlaceholder')}
            aria-label={t('campaign:character.spellDescLabel')}
            rows={2}
          />
          <button type="submit">
            {editing !== null ? t('common:btn.save') : t('common:btn.add')}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(null); setAddOpen(false); }}
          >
            {t('common:btn.cancel')}
          </button>
        </form>
      )}

      {!readOnly && !addOpen && editing === null && (
        <button type="button" onClick={openAdd} className="spells-list__add">
          {t('campaign:character.addSpellBtn')}
        </button>
      )}
    </fieldset>
  );
}
