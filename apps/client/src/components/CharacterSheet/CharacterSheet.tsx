import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role } from '@vtt/shared';
import styles from './CharacterSheet.module.css';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  loadCharacter,
  updateCharacterThunk,
  uploadPdfThunk,
  createCharacterThunk,
  loadCharacters,
  setCurrentCharacter,
} from '../../store/characters';
import SpellsList, { type SpellEntry } from './SpellsList';

interface CharacterSheetProps {
  characterId?: string | null;
  roomId: string;
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
  maxHp: number;
  ac: number;
  speed: number;
  skills: SheetSkill[];
  inventory: string[];
  spells: SpellEntry[];
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

function conMod(attrs: SheetAttributes): number {
  return modifier(attrs.CON);
}

function makeDefaultSheet(attrs = DEFAULT_ATTRIBUTES): SheetData {
  const con = conMod(attrs);
  return {
    attributes: { ...attrs },
    hp: 8 + con,
    maxHp: 8 + con,
    ac: 10,
    speed: 30,
    skills: [...DEFAULT_SKILLS],
    inventory: [],
    spells: [],
  };
}

function safeRecord(val: unknown): Record<string, unknown> {
  return (val && typeof val === 'object' ? val : {}) as Record<string, unknown>;
}

function normaliseSpells(raw: unknown): SpellEntry[] {
  return Array.isArray(raw) ? (raw as SpellEntry[]) : [];
}

function normaliseSheet(raw: unknown): SheetData {
  const r = safeRecord(raw);
  const attrs = { ...DEFAULT_ATTRIBUTES, ...(safeRecord(r.attributes) as Partial<SheetAttributes>) };
  return {
    attributes: attrs,
    hp: typeof r.hp === 'number' ? r.hp : 8 + conMod(attrs),
    maxHp: typeof r.maxHp === 'number' ? r.maxHp : 8 + conMod(attrs),
    ac: typeof r.ac === 'number' ? r.ac : 10,
    speed: typeof r.speed === 'number' ? r.speed : 30,
    skills: Array.isArray(r.skills) && r.skills.length > 0 ? r.skills as SheetSkill[] : DEFAULT_SKILLS,
    inventory: Array.isArray(r.inventory) ? r.inventory as string[] : [],
    spells: normaliseSpells(r.spells),
  };
}

function isGmViewer(role: Role, isOwner: boolean): boolean {
  return role === 'GM' && !isOwner;
}

interface CharacterListViewProps {
  roomId: string;
  myRole: Role;
}

function CharacterListView({ roomId, myRole }: CharacterListViewProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common', 'errors']);
  const dispatch = useAppDispatch();
  const allChars = useAppSelector((s) => s.characters.items);
  const myUserId = useAppSelector((s) => s.session.currentUser?.id);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myChars = allChars.filter((c) => c.ownerId === myUserId);
  const otherChars = myRole === 'GM' ? allChars.filter((c) => c.ownerId !== myUserId) : [];

  return (
    <section className={styles.sheet}>
      <h3>{t('campaign:character.heading')}</h3>
      {myChars.length > 0 && (
        <>
          <h4>{t('campaign:character.myChars')}</h4>
          <ul>
            {myChars.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => dispatch(setCurrentCharacter(c))}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {otherChars.length > 0 && (
        <>
          <h4>{t('campaign:character.otherChars')}</h4>
          <ul>
            {otherChars.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => dispatch(setCurrentCharacter(c))}>
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {myRole !== 'Observer' && (
        creating ? (
          <form
            className={styles.section}
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await dispatch(
                  createCharacterThunk({
                    roomId,
                    req: { name: newName.trim(), sheetData: makeDefaultSheet() },
                  }),
                ).unwrap();
                setNewName('');
                setCreating(false);
              } catch {
                setError(t('errors:network.characterCreateFailed'));
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              className={styles.inventoryInput}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('campaign:character.namePlaceholder')}
              aria-label={t('campaign:character.newNameLabel')}
              required
            />
            <button type="submit" className={styles.btnSave} disabled={busy}>
              {busy ? t('common:btn.creating') : t('common:btn.create')}
            </button>
            <button type="button" className={styles.btnCreate} onClick={() => setCreating(false)} disabled={busy}>
              {t('common:btn.cancel')}
            </button>
            {error && <p className={styles.error}>{error}</p>}
          </form>
        ) : (
          <button
            type="button"
            className={styles.btnCreate}
            onClick={() => setCreating(true)}
            aria-label={t('campaign:character.newAriaLabel')}
          >
            {t('campaign:character.newBtn')}
          </button>
        )
      )}
    </section>
  );
}

function ShortView({ name, portraitUrl }: { name: string; portraitUrl?: string }): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <section className={styles.sheet}>
      <h3>{name}</h3>
      {portraitUrl && <img src={portraitUrl} alt={name} />}
      <p>{t('character.closedByOwner')}</p>
    </section>
  );
}

export default function CharacterSheet({ characterId, roomId, myRole }: CharacterSheetProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
  const dispatch = useAppDispatch();
  const current = useAppSelector((s) => s.characters.current);
  const myUserId = useAppSelector((s) => s.session.currentUser?.id);

  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<SheetData>(() => makeDefaultSheet());

  useEffect(() => {
    if (!characterId) {
      void dispatch(loadCharacters(roomId));
    }
  }, [characterId, roomId, dispatch]);

  useEffect(() => {
    if (characterId) {
      void dispatch(loadCharacter(characterId));
    } else {
      dispatch(setCurrentCharacter(null));
    }
  }, [characterId, dispatch]);

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

  if (!characterId) {
    return <CharacterListView roomId={roomId} myRole={myRole} />;
  }

  if (!current) return <p>{t('campaign:character.loading')}</p>;
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
    <section
      className={styles.sheet}
      aria-label={t('campaign:character.sheetLabel', { name: current.name })}
    >
      <header className={styles.header}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={readOnly}
          aria-label={t('campaign:character.nameInputLabel')}
          className={styles.name}
        />
        <div
          aria-label={t('campaign:character.portraitLabel')}
        />
        {isGmViewer(myRole, isOwner) && (
          <span>{t('campaign:character.readOnlyBadge')}</span>
        )}
      </header>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>{t('campaign:character.attrs')}</legend>
        {(Object.keys(sheet.attributes) as (keyof SheetAttributes)[]).map((key) => (
          <label key={key} className={styles.stat}>
            <span className={styles.statLabel}>{key}</span>
            <input
              type="number"
              className={styles.statInput}
              value={sheet.attributes[key]}
              onChange={(e) => patch(key, Number(e.target.value))}
              aria-label={t('campaign:character.attrLabel', { key })}
            />
            <span className={styles.statMod}>{modifier(sheet.attributes[key])}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>{t('campaign:character.vitals')}</legend>
        <label>
          HP
          <input
            type="number"
            value={sheet.hp}
            onChange={(e) => setSheet((s) => ({ ...s, hp: Number(e.target.value) }))}
          />
        </label>
        <label>
          Max HP
          <input
            type="number"
            value={sheet.maxHp}
            onChange={(e) => setSheet((s) => ({ ...s, maxHp: Number(e.target.value) }))}
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

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>{t('campaign:character.skills')}</legend>
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
              <span className={styles.statMod}>{sk.proficient ? '+2' : '+0'}</span>
            </li>
          ))}
        </ul>
      </fieldset>

      <fieldset className={styles.section} disabled={readOnly}>
        <legend>{t('campaign:character.inventory')}</legend>
        <ul>
          {sheet.inventory.map((item, idx) => (
            <li key={idx}>
              <input
                className={styles.inventoryInput}
                value={item}
                onChange={(e) => setInventoryAt(idx, e.target.value)}
                aria-label={t('campaign:character.inventoryItem', { idx: idx + 1 })}
              />
              <button
                type="button"
                onClick={() => removeInventoryAt(idx)}
                aria-label={t('common:btn.delete')}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <button type="button" onClick={addInventory}>
            {t('campaign:character.addInventoryBtn')}
          </button>
        )}
      </fieldset>

      <SpellsList
        spells={sheet.spells}
        readOnly={readOnly}
        onChange={(spells) => setSheet((s) => ({ ...s, spells }))}
      />

      <section className={styles.section}>
        <h4>{t('campaign:character.pdfSection')}</h4>
        {current.pdfUrl && (
          <iframe
            src={current.pdfUrl}
            width="100%"
            height={600}
            title={t('campaign:character.pdfTitle', { name: current.name })}
          />
        )}
        {isOwner && (
          <input
            type="file"
            accept="application/pdf"
            onChange={onPdf}
            aria-label={t('campaign:character.pdfUploadLabel')}
          />
        )}
      </section>

      {isOwner && (
        <div>
          <button type="button" className={styles.btnSave} onClick={onSave}>{t('common:btn.save')}</button>
        </div>
      )}
    </section>
  );
}
