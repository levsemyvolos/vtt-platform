import React, { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role, CharacterSheetFullDTO } from '@vtt/shared';
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
import { Avatar, Button, Tabs, type TabItem } from '../ui';

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

const ATTR_LABELS: Record<keyof SheetAttributes, string> = {
  STR: 'СИЛА', DEX: 'СПРИТН.', CON: 'ЗДОРОВ.', INT: 'ІНТЕЛ.', WIS: 'МУДР.', CHA: 'ХАРИЗМА',
};

type SheetTab = 'stats' | 'skills' | 'inventory' | 'spells';

const SHEET_TABS: ReadonlyArray<TabItem<SheetTab>> = [
  { id: 'stats', label: 'Характеристики' },
  { id: 'skills', label: 'Навички' },
  { id: 'inventory', label: 'Інвентар' },
  { id: 'spells', label: 'Заклинання' },
];

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
      <span className={`eyebrow ${styles.sectionTitle}`}>{t('campaign:character.heading')}</span>
      {myChars.length > 0 && (
        <>
          <p className={styles.subheading}>{t('campaign:character.myChars')}</p>
          <ul className={styles.charList}>
            {myChars.map((c) => (
              <li key={c.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => dispatch(setCurrentCharacter(c))}
                >
                  {c.name}
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
      {otherChars.length > 0 && (
        <>
          <p className={styles.subheading}>{t('campaign:character.otherChars')}</p>
          <ul className={styles.charList}>
            {otherChars.map((c) => (
              <li key={c.id}>
                <Button
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={() => dispatch(setCurrentCharacter(c))}
                >
                  {c.name}
                </Button>
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
            <div className={styles.btnRow}>
              <Button type="submit" variant="primary" size="sm" isLoading={busy} disabled={busy}>
                {busy ? t('common:btn.creating') : t('common:btn.create')}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)} disabled={busy}>
                {t('common:btn.cancel')}
              </Button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </form>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            fullWidth
            onClick={() => setCreating(true)}
            aria-label={t('campaign:character.newAriaLabel')}
          >
            {t('campaign:character.newBtn')}
          </Button>
        )
      )}
    </section>
  );
}

interface SheetTabContentProps {
  activeTab: SheetTab;
  sheet: SheetData;
  readOnly: boolean;
  isOwner: boolean;
  current: CharacterSheetFullDTO;
  patch: (attr: keyof SheetAttributes, val: number) => void;
  setSheet: React.Dispatch<React.SetStateAction<SheetData>>;
  addInventory: () => void;
  setInventoryAt: (idx: number, value: string) => void;
  removeInventoryAt: (idx: number) => void;
  onPdf: (e: ChangeEvent<HTMLInputElement>) => void;
}

function SheetTabContent({
  activeTab, sheet, readOnly, isOwner, current,
  patch, setSheet, addInventory, setInventoryAt, removeInventoryAt, onPdf,
}: SheetTabContentProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common']);
  if (activeTab === 'stats') {
    return (
      <fieldset className={styles.section} disabled={readOnly}>
        <legend className="eyebrow">{t('campaign:character.attrs')}</legend>
        <div className={styles.stats}>
          {(Object.keys(sheet.attributes) as (keyof SheetAttributes)[]).map((key) => (
            <label key={key} className={styles.stat}>
              <span className={styles.statLabel}>{ATTR_LABELS[key]}</span>
              <input
                type="number"
                className={styles.statInput}
                value={sheet.attributes[key]}
                onChange={(e) => patch(key, Number(e.target.value))}
                aria-label={t('campaign:character.attrLabel', { key })}
              />
              <span className={styles.statMod}>
                {modifier(sheet.attributes[key]) >= 0 ? '+' : ''}{modifier(sheet.attributes[key])}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (activeTab === 'skills') {
    return (
      <fieldset className={styles.section} disabled={readOnly}>
        <legend className="eyebrow">{t('campaign:character.skills')}</legend>
        <ul className={styles.skillList}>
          {sheet.skills.map((sk, idx) => (
            <li key={sk.name} className={styles.skillItem}>
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
                <span className={styles.skillName}>{sk.name}</span>
              </label>
              <span className={styles.skillMod}>{sk.proficient ? '+2' : '+0'}</span>
            </li>
          ))}
        </ul>
      </fieldset>
    );
  }
  if (activeTab === 'inventory') {
    return (
      <fieldset className={styles.section} disabled={readOnly}>
        <legend className="eyebrow">{t('campaign:character.inventory')}</legend>
        <ul>
          {sheet.inventory.map((item, idx) => (
            <li key={idx} className={styles.inventoryRow}>
              <input
                className={styles.inventoryInput}
                value={item}
                onChange={(e) => setInventoryAt(idx, e.target.value)}
                aria-label={t('campaign:character.inventoryItem', { idx: idx + 1 })}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeInventoryAt(idx)}
                aria-label={t('common:btn.delete')}
              >
                &times;
              </Button>
            </li>
          ))}
        </ul>
        {!readOnly && (
          <Button type="button" variant="secondary" size="sm" onClick={addInventory}>
            {t('campaign:character.addInventoryBtn')}
          </Button>
        )}
      </fieldset>
    );
  }
  return (
    <>
      <SpellsList
        spells={sheet.spells}
        readOnly={readOnly}
        onChange={(spells) => setSheet((s) => ({ ...s, spells }))}
      />
      <section className={styles.section}>
        <span className={`eyebrow ${styles.sectionTitle}`}>{t('campaign:character.pdfSection')}</span>
        {current.pdfUrl && (
          <iframe
            src={current.pdfUrl}
            width="100%"
            height={400}
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
    </>
  );
}

function ShortView({ name, portraitUrl }: { name: string; portraitUrl?: string }): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <section className={styles.sheet}>
      <div className={styles.header}>
        <Avatar size="lg" name={name} {...(portraitUrl ? { src: portraitUrl } : {})} />
        <span className={styles.name}>{name}</span>
      </div>
      <p className={styles.empty}>{t('character.closedByOwner')}</p>
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
  const [activeTab, setActiveTab] = useState<SheetTab>('stats');

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
        <Avatar size="lg" name={name} className={styles.portrait} />
        <div className={styles.headerInfo}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly}
            aria-label={t('campaign:character.nameInputLabel')}
            className={styles.name}
          />
          <div className={styles.vitalsInline}>
            <span className={styles.vitalChip}>HP {sheet.hp}/{sheet.maxHp}</span>
            <span className={styles.vitalChip}>AC {sheet.ac}</span>
            <span className={styles.vitalChip}>{sheet.speed}ft</span>
          </div>
          {isGmViewer(myRole, isOwner) && (
            <span className={`eyebrow ${styles.readOnlyBadge}`}>{t('campaign:character.readOnlyBadge')}</span>
          )}
        </div>
      </header>

      <Tabs
        variant="underline"
        items={SHEET_TABS}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Character sheet sections"
      />

      <SheetTabContent
        activeTab={activeTab}
        sheet={sheet}
        readOnly={readOnly}
        isOwner={isOwner}
        current={current}
        patch={patch}
        setSheet={setSheet}
        addInventory={addInventory}
        setInventoryAt={setInventoryAt}
        removeInventoryAt={removeInventoryAt}
        onPdf={onPdf}
      />

      {isOwner && (
        <div className={styles.btnRow}>
          <Button type="button" variant="primary" size="sm" onClick={onSave}>
            {t('common:btn.save')}
          </Button>
        </div>
      )}
    </section>
  );
}
