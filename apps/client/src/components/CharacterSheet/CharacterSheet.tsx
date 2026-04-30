import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { Role } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  loadCharacter,
  updateCharacterThunk,
  uploadPdfThunk,
} from '../../store/characters';

interface CharacterSheetProps {
  characterId: string;
  myRole: Role;
}

interface SheetAttributes {
  STR: number;
  DEX: number;
  CON: number;
  INT: number;
  WIS: number;
  CHA: number;
}

interface SheetSkill {
  name: string;
  proficient: boolean;
}

interface SheetData {
  attributes: SheetAttributes;
  hp: number;
  ac: number;
  speed: number;
  skills: SheetSkill[];
  inventory: string[];
  spells: string;
}

const DEFAULT_ATTRIBUTES: SheetAttributes = {
  STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10,
};

const DEFAULT_SKILLS: SheetSkill[] = [
  { name: 'Acrobatics', proficient: false },
  { name: 'Athletics', proficient: false },
  { name: 'Stealth', proficient: false },
  { name: 'Perception', proficient: false },
  { name: 'Insight', proficient: false },
  { name: 'Persuasion', proficient: false },
];

function modifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

function normaliseSheet(raw: unknown): SheetData {
  const r = (raw ?? {}) as Partial<SheetData>;
  return {
    attributes: { ...DEFAULT_ATTRIBUTES, ...(r.attributes ?? {}) },
    hp: typeof r.hp === 'number' ? r.hp : 10,
    ac: typeof r.ac === 'number' ? r.ac : 10,
    speed: typeof r.speed === 'number' ? r.speed : 30,
    skills: Array.isArray(r.skills) && r.skills.length > 0 ? r.skills : DEFAULT_SKILLS,
    inventory: Array.isArray(r.inventory) ? r.inventory : [],
    spells: typeof r.spells === 'string' ? r.spells : '',
  };
}

function ShortView({
  name,
  portraitUrl,
}: {
  name: string;
  portraitUrl?: string;
}): JSX.Element {
  return (
    <section className="character-sheet character-sheet--short">
      <h3>{name}</h3>
      {portraitUrl && (
        <img src={portraitUrl} alt={name} className="character-sheet__portrait" />
      )}
      <p className="character-sheet__notice">
        Аркуш закритий власником — доступне лише ім'я та портрет.
      </p>
    </section>
  );
}

/**
 * Аркуш персонажа D&D 5e (Ф7.5). Редагування доступне лише власнику;
 * GM має read-only перегляд (RBAC: GM не модифікує аркуш без згоди гравця).
 */
export default function CharacterSheet({
  characterId,
  myRole,
}: CharacterSheetProps): JSX.Element {
  const dispatch = useAppDispatch();
  const current = useAppSelector((s) => s.characters.current);
  const myUserId = useAppSelector((s) => s.session.currentUser?.id);

  useEffect(() => {
    void dispatch(loadCharacter(characterId));
  }, [characterId, dispatch]);

  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<SheetData>(() => normaliseSheet(undefined));

  useEffect(() => {
    if (!current) return;
    setName(current.name);
    if (current.kind === 'full') setSheet(normaliseSheet(current.sheetData));
  }, [current]);

  const isOwner = useMemo(() => {
    if (!current || !myUserId) return false;
    return current.ownerId === myUserId;
  }, [current, myUserId]);
  const readOnly = !isOwner;

  if (!current) return <p>Завантаження аркуша…</p>;
  if (current.kind === 'short') {
    return (
      <ShortView
        name={current.name}
        {...(current.portraitUrl ? { portraitUrl: current.portraitUrl } : {})}
      />
    );
  }

  const patch = <K extends keyof SheetAttributes>(attr: K, val: number): void => {
    setSheet((s) => ({ ...s, attributes: { ...s.attributes, [attr]: val } }));
  };
  const onSave = (): void => {
    if (readOnly) return;
    void dispatch(updateCharacterThunk({ id: characterId, req: { name, sheetData: sheet } }));
  };
  const onPdf = (e: ChangeEvent<HTMLInputElement>): void => {
    if (readOnly) return;
    const file = e.target.files?.[0];
    if (!file) return;
    void dispatch(uploadPdfThunk({ id: characterId, file }));
  };
  const addInventory = (): void =>
    setSheet((s) => ({ ...s, inventory: [...s.inventory, ''] }));
  const setInventoryAt = (idx: number, value: string): void =>
    setSheet((s) => ({
      ...s,
      inventory: s.inventory.map((it, i) => (i === idx ? value : it)),
    }));
  const removeInventoryAt = (idx: number): void =>
    setSheet((s) => ({ ...s, inventory: s.inventory.filter((_, i) => i !== idx) }));

  return (
    <section className="character-sheet character-sheet--full" aria-label={`Аркуш ${current.name}`}>
      <header className="character-sheet__header">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          aria-label="Ім'я персонажа"
          className="character-sheet__name"
        />
        <div className="character-sheet__portrait-slot" aria-label="Портрет (placeholder)" />
        {myRole === 'GM' && !isOwner && (
          <span className="character-sheet__badge">Read-only (GM перегляд)</span>
        )}
      </header>

      <fieldset className="character-sheet__attrs" disabled={readOnly}>
        <legend>Атрибути</legend>
        {(Object.keys(sheet.attributes) as (keyof SheetAttributes)[]).map((key) => (
          <label key={key} className="character-sheet__attr">
            <span>{key}</span>
            <input
              type="number"
              value={sheet.attributes[key]}
              onChange={(e) => patch(key, Number(e.target.value))}
              aria-label={`Атрибут ${key}`}
            />
            <span className="character-sheet__mod">{modifier(sheet.attributes[key])}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="character-sheet__vitals" disabled={readOnly}>
        <legend>Vitals</legend>
        <label>
          HP
          <input
            type="number"
            value={sheet.hp}
            onChange={(e) => setSheet((s) => ({ ...s, hp: Number(e.target.value) }))}
          />
        </label>
        <label>
          AC
          <input
            type="number"
            value={sheet.ac}
            onChange={(e) => setSheet((s) => ({ ...s, ac: Number(e.target.value) }))}
          />
        </label>
        <label>
          Speed
          <input
            type="number"
            value={sheet.speed}
            onChange={(e) => setSheet((s) => ({ ...s, speed: Number(e.target.value) }))}
          />
        </label>
      </fieldset>

      <fieldset className="character-sheet__skills" disabled={readOnly}>
        <legend>Skills</legend>
        <ul>
          {sheet.skills.map((sk, idx) => (
            <li key={sk.name}>
              <label>
                <input
                  type="checkbox"
                  checked={sk.proficient}
                  onChange={(e) =>
                    setSheet((s) => ({
                      ...s,
                      skills: s.skills.map((it, i) =>
                        i === idx ? { ...it, proficient: e.target.checked } : it,
                      ),
                    }))
                  }
                />
                {sk.name}
              </label>
              <span className="character-sheet__mod">{sk.proficient ? '+2' : '+0'}</span>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className="character-sheet__inventory" disabled={readOnly}>
        <legend>Inventory</legend>
        <ul>
          {sheet.inventory.map((item, idx) => (
            <li key={idx}>
              <input
                value={item}
                onChange={(e) => setInventoryAt(idx, e.target.value)}
                aria-label={`Предмет ${idx + 1}`}
              />
              <button type="button" onClick={() => removeInventoryAt(idx)} aria-label="Видалити">×</button>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <button type="button" onClick={addInventory}>+ Додати предмет</button>
        )}
      </fieldset>

      <fieldset className="character-sheet__spells" disabled={readOnly}>
        <legend>Spells</legend>
        <textarea
          value={sheet.spells}
          onChange={(e) => setSheet((s) => ({ ...s, spells: e.target.value }))}
          rows={4}
          aria-label="Заклинання"
        />
      </fieldset>

      <section className="character-sheet__pdf">
        <h4>PDF</h4>
        {current.pdfUrl && (
          <iframe
            src={current.pdfUrl}
            width="100%"
            height={600}
            title={`PDF аркуш ${current.name}`}
          />
        )}
        {isOwner && (
          <input type="file" accept="application/pdf" onChange={onPdf} aria-label="Завантажити PDF" />
        )}
      </section>

      {isOwner && (
        <div className="character-sheet__actions">
          <button type="button" onClick={onSave}>Зберегти</button>
        </div>
      )}
    </section>
  );
}
