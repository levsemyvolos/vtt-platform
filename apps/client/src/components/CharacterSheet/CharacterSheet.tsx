import React, { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Role,
  CharacterSheetFullDTO,
  CharacterSheetData,
  Sheet5e,
  SheetPdf,
  SheetVitals,
  SheetMode,
  VitalsBlock,
  Ability,
  SkillId,
  SkillProf,
  Identity5e,
  Combat5e,
  Spellcasting5e,
  Personality5e,
  AttackEntry5e,
  SpellSlot,
} from '@vtt/shared';
import { ALL_ABILITIES, ALL_SKILL_IDS, makeEmpty5eSheet, makeEmptyPdfSheet, makeEmptyVitalsSheet } from '@vtt/shared';
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
import SpellsList from './SpellsList';
import { Avatar, Button } from '../ui';
import {
  IdentityHeader,
  AbilityCard,
  SaveRow,
  SkillRow,
  StatBox,
  HpBlock,
  HitDiceBlock,
  AttackTable,
  SpellSlots,
  PersonalityBlock,
  SpellcastingBlock,
  proficiencyBonus,
  saveModFor,
  skillModFor,
  passivePerception,
  initiativeMod,
  formatMod,
} from './dnd5e';
import { normaliseCharacterSheet } from './dnd5e/normalise';
import SystemSelector from './SystemSelector';
import PdfSheetView from './PdfSheetView';
import VitalsSheetView from './VitalsSheetView';
import VitalsStrip from './VitalsStrip';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isGmViewer(role: Role, isOwner: boolean): boolean {
  return role === 'GM' && !isOwner;
}

function makeDefaultSheetData(): Record<string, unknown> {
  return makeEmpty5eSheet() as unknown as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Switch-mode helpers (cyclomatic complexity ≤ 5 each)
// ---------------------------------------------------------------------------

function restoreArchive(curr: CharacterSheetData, next: SheetMode): CharacterSheetData | null {
  if (next === '5e' && curr.kind !== '5e' && curr._archived5e) {
    return curr._archived5e;
  }
  if (next === 'pdf' && curr.kind === 'vitals' && curr._archivedPdf) {
    return curr._archivedPdf;
  }
  if (next === 'vitals' && curr.kind === 'pdf' && curr._archivedVitals) {
    return curr._archivedVitals;
  }
  return null;
}

type ArchiveSlots = {
  _archived5e?: Sheet5e;
  _archivedPdf?: SheetPdf;
  _archivedVitals?: SheetVitals;
};

function archiveCurrent(curr: CharacterSheetData): ArchiveSlots {
  if (curr.kind === '5e') {
    return { _archived5e: curr };
  }
  if (curr.kind === 'pdf') {
    const stripped: SheetPdf = { kind: 'pdf', vitals: curr.vitals };
    return { _archivedPdf: stripped };
  }
  const strippedV: SheetVitals = { kind: 'vitals', vitals: curr.vitals, notes: curr.notes };
  return { _archivedVitals: strippedV };
}

function mergeArchive<T extends CharacterSheetData>(target: T, archived: ArchiveSlots): T {
  return { ...target, ...archived };
}

function performSwitch(curr: CharacterSheetData, next: SheetMode): CharacterSheetData {
  const universalVitals = curr.vitals;
  const archived = archiveCurrent(curr);
  const prior = restoreArchive(curr, next);
  if (prior !== null) return { ...mergeArchive(prior, archived), vitals: universalVitals };
  if (next === '5e') return { ...mergeArchive(makeEmpty5eSheet(), archived), vitals: universalVitals };
  if (next === 'pdf') return { ...mergeArchive(makeEmptyPdfSheet(), archived), vitals: universalVitals };
  return { ...mergeArchive(makeEmptyVitalsSheet(), archived), vitals: universalVitals };
}

// ---------------------------------------------------------------------------
// CharacterListView — unchanged from original
// ---------------------------------------------------------------------------

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
                <Button variant="ghost" size="sm" fullWidth onClick={() => dispatch(setCurrentCharacter(c))}>
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
                <Button variant="ghost" size="sm" fullWidth onClick={() => dispatch(setCurrentCharacter(c))}>
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
                  createCharacterThunk({ roomId, req: { name: newName.trim(), sheetData: makeDefaultSheetData() } }),
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

// ---------------------------------------------------------------------------
// ShortView — unchanged from original
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Column props — 5e-specific state slice
// ---------------------------------------------------------------------------

interface FiveEColBaseProps {
  sheet: Sheet5e;
  readOnly: boolean;
  onAbility: (ab: Ability, v: number) => void;
  onSaveProf: (ab: Ability, v: boolean) => void;
  onSkillTier: (id: SkillId, tier: SkillProf) => void;
  onVitals: (patch: Partial<VitalsBlock>) => void;
  onCombat: (patch: Partial<Combat5e>) => void;
  onHitDice: (total: number | null, used: number | null, type?: 'd6' | 'd8' | 'd10' | 'd12') => void;
  onSpellcasting: (patch: Partial<Spellcasting5e>) => void;
  onPersonality: (patch: Partial<Personality5e>) => void;
  onAttacks: (next: AttackEntry5e[]) => void;
  onSpellSlots: (next: SpellSlot[]) => void;
  onOtherProfs: (v: string) => void;
  onEquipment: (v: string) => void;
  onSpellsChange: (next: Sheet5e['spells']) => void;
}

// ---------------------------------------------------------------------------
// Left column (5e)
// ---------------------------------------------------------------------------

function LeftColumn({ sheet, readOnly, onAbility, onSaveProf, onSkillTier, onCombat, onOtherProfs }: Pick<
  FiveEColBaseProps,
  'sheet' | 'readOnly' | 'onAbility' | 'onSaveProf' | 'onSkillTier' | 'onCombat' | 'onOtherProfs'
>): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <div className={styles.col}>
      <section className={styles.section} aria-label={t('dnd5e.section.abilities')}>
        {ALL_ABILITIES.map((ab) => (
          <AbilityCard key={ab} ability={ab} score={sheet.abilities[ab]}
            onChange={(v) => onAbility(ab, v)} disabled={readOnly} />
        ))}
      </section>

      <section className={styles.section} aria-label={`${t('dnd5e.section.inspiration')} & ${t('dnd5e.section.proficiencyBonus')}`}>
        <label className={styles.inspirationRow}>
          <input type="checkbox" checked={sheet.combat.inspiration ?? false}
            onChange={(e) => onCombat({ inspiration: e.target.checked })}
            disabled={readOnly} aria-label={t('dnd5e.section.inspiration')} />
          <span>{t('dnd5e.section.inspiration')}</span>
        </label>
        <div className={styles.profBonus}>
          <span className={styles.profBonusLabel}>{t('dnd5e.section.proficiencyBonus')}</span>
          <span className={styles.profBonusValue}>{formatMod(proficiencyBonus(sheet.identity.level))}</span>
        </div>
      </section>

      <section className={styles.section} aria-label={t('dnd5e.section.savingThrows')}>
        <h3 className={styles.sectionTitle}>{t('dnd5e.section.savingThrows')}</h3>
        {ALL_ABILITIES.map((ab) => (
          <SaveRow key={ab} ability={ab} proficient={sheet.saveProfs[ab]}
            modValue={saveModFor(sheet, ab)}
            onToggle={(next) => onSaveProf(ab, next)} disabled={readOnly} />
        ))}
      </section>

      <section className={styles.section} aria-label={t('dnd5e.section.skills')}>
        <h3 className={styles.sectionTitle}>{t('dnd5e.section.skills')}</h3>
        {ALL_SKILL_IDS.map((id) => (
          <SkillRow key={id} skillId={id} tier={sheet.skills[id] ?? 'none'}
            modValue={skillModFor(sheet, id)}
            onChangeTier={(next) => onSkillTier(id, next)} disabled={readOnly} />
        ))}
      </section>

      <section className={styles.section} aria-label={t('dnd5e.section.passivePerception')}>
        <div className={styles.passive}>
          <span>{t('dnd5e.section.passivePerception')}</span>
          <span className={styles.modBadge}>{passivePerception(sheet)}</span>
        </div>
      </section>

      <section className={styles.section} aria-label={t('dnd5e.section.otherProficiencies')}>
        <h3 className={styles.sectionTitle}>{t('dnd5e.section.otherProficiencies')}</h3>
        <textarea value={sheet.otherProfs ?? ''} onChange={(e) => onOtherProfs(e.target.value)}
          disabled={readOnly} className={styles.textarea} rows={4} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Center column (5e)
// ---------------------------------------------------------------------------

function CenterColumn({ sheet, readOnly, onVitals, onHitDice, onSpellcasting, onAttacks, onSpellSlots, onSpellsChange }: Pick<
  FiveEColBaseProps,
  'sheet' | 'readOnly' | 'onVitals' | 'onHitDice' | 'onSpellcasting' | 'onAttacks' | 'onSpellSlots' | 'onSpellsChange'
>): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <div className={styles.col}>
      <section className={styles.combatTop}>
        <StatBox label={t('dnd5e.section.armorClass')} value={sheet.vitals.ac ?? null}
          onChange={(v) => onVitals({ ac: v })} min={0} max={40} disabled={readOnly} />
        <StatBox label={t('dnd5e.section.initiative')} value={sheet.vitals.initiativeOverride ?? null}
          onChange={(v) => onVitals({ initiativeOverride: v })}
          placeholder={formatMod(initiativeMod(sheet))} disabled={readOnly} />
        <StatBox label={t('dnd5e.section.speed')} value={sheet.vitals.speed ?? null}
          onChange={(v) => onVitals({ speed: v })} min={0} max={120} disabled={readOnly} />
      </section>

      <HpBlock hp={sheet.vitals.hp ?? null} maxHp={sheet.vitals.maxHp ?? null}
        tempHp={sheet.vitals.tempHp ?? null}
        onChange={(p) => onVitals(p)} disabled={readOnly} />

      <HitDiceBlock
        total={sheet.combat.hitDiceTotal ?? null}
        used={sheet.combat.hitDiceUsed ?? null}
        type={sheet.combat.hitDiceType}
        onChange={(p) => onHitDice(
          p.total !== undefined ? p.total : sheet.combat.hitDiceTotal ?? null,
          p.used !== undefined ? p.used : sheet.combat.hitDiceUsed ?? null,
          p.type !== undefined ? p.type : sheet.combat.hitDiceType,
        )}
        disabled={readOnly}
      />

      <section className={styles.section} aria-label={t('dnd5e.section.attacks')}>
        <h3 className={styles.sectionTitle}>{t('dnd5e.section.attacks')}</h3>
        <AttackTable attacks={sheet.attacks} onChange={onAttacks} disabled={readOnly} />
      </section>

      <SpellcastingBlock value={sheet.spellcasting} abilityScores={sheet.abilities}
        level={sheet.identity.level} onChange={onSpellcasting} disabled={readOnly} />

      <SpellSlots slots={sheet.spellcasting.slots} onChange={onSpellSlots} disabled={readOnly} />

      <SpellsList spells={sheet.spells} readOnly={readOnly} onChange={onSpellsChange} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right column (5e)
// ---------------------------------------------------------------------------

function RightColumn({ sheet, readOnly, onPersonality, onEquipment }: Pick<
  FiveEColBaseProps,
  'sheet' | 'readOnly' | 'onPersonality' | 'onEquipment'
>): JSX.Element {
  const { t } = useTranslation('campaign');
  return (
    <div className={styles.col}>
      <PersonalityBlock value={sheet.personality} onChange={onPersonality} disabled={readOnly} />

      <section className={styles.section} aria-label={t('dnd5e.section.equipment')}>
        <h3 className={styles.sectionTitle}>{t('dnd5e.section.equipment')}</h3>
        <textarea value={sheet.equipment ?? ''} onChange={(e) => onEquipment(e.target.value)}
          disabled={readOnly} className={styles.textarea} rows={10} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FiveESheetBody — wraps 3-col grid + all 5e patch helpers
// ---------------------------------------------------------------------------

interface FiveESheetBodyProps {
  sheet: Sheet5e;
  onChangeSheet: (next: Sheet5e) => void;
  readOnly: boolean;
}

function FiveESheetBody({ sheet, onChangeSheet, readOnly }: FiveESheetBodyProps): JSX.Element {
  const setAbility = (ab: Ability, val: number): void =>
    onChangeSheet({ ...sheet, abilities: { ...sheet.abilities, [ab]: val } });
  const setSaveProf = (ab: Ability, prof: boolean): void =>
    onChangeSheet({ ...sheet, saveProfs: { ...sheet.saveProfs, [ab]: prof } });
  const setSkillTier = (sid: SkillId, tier: SkillProf): void =>
    onChangeSheet({ ...sheet, skills: { ...sheet.skills, [sid]: tier } });
  const setVitals = (patch: Partial<VitalsBlock>): void =>
    onChangeSheet({ ...sheet, vitals: { ...sheet.vitals, ...patch } });
  const setCombat = (patch: Partial<Combat5e>): void =>
    onChangeSheet({ ...sheet, combat: { ...sheet.combat, ...patch } });
  const setSpellcasting = (patch: Partial<Spellcasting5e>): void =>
    onChangeSheet({ ...sheet, spellcasting: { ...sheet.spellcasting, ...patch } });
  const setPersonality = (patch: Partial<Personality5e>): void =>
    onChangeSheet({ ...sheet, personality: { ...sheet.personality, ...patch } });
  const setAttacks = (next: AttackEntry5e[]): void =>
    onChangeSheet({ ...sheet, attacks: next });
  const setSpellSlots = (next: SpellSlot[]): void =>
    onChangeSheet({ ...sheet, spellcasting: { ...sheet.spellcasting, slots: next } });
  const setOtherProfs = (val: string): void =>
    onChangeSheet({ ...sheet, otherProfs: val });
  const setEquipment = (val: string): void =>
    onChangeSheet({ ...sheet, equipment: val });

  const handleHitDice = (
    total: number | null,
    used: number | null,
    type?: 'd6' | 'd8' | 'd10' | 'd12',
  ): void => {
    const patch: Partial<Combat5e> = { hitDiceTotal: total, hitDiceUsed: used };
    if (type !== undefined) patch.hitDiceType = type;
    setCombat(patch);
  };

  return (
    <div className={styles.sheetGrid}>
      <LeftColumn
        sheet={sheet}
        readOnly={readOnly}
        onAbility={setAbility}
        onSaveProf={setSaveProf}
        onSkillTier={setSkillTier}
        onCombat={setCombat}
        onOtherProfs={setOtherProfs}
      />
      <CenterColumn
        sheet={sheet}
        readOnly={readOnly}
        onVitals={setVitals}
        onHitDice={handleHitDice}
        onSpellcasting={setSpellcasting}
        onAttacks={setAttacks}
        onSpellSlots={setSpellSlots}
        onSpellsChange={(next) => onChangeSheet({ ...sheet, spells: next })}
      />
      <RightColumn
        sheet={sheet}
        readOnly={readOnly}
        onPersonality={setPersonality}
        onEquipment={setEquipment}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PdfModeBody
// ---------------------------------------------------------------------------

interface PdfModeBodyProps {
  sheet: SheetPdf;
  pdfUrl?: string;
  onUploadPdf?: (file: File) => void;
  onChangeVitals: (patch: Partial<VitalsBlock>) => void;
  readOnly: boolean;
}

function PdfModeBody({ sheet, pdfUrl, onUploadPdf, onChangeVitals, readOnly }: PdfModeBodyProps): JSX.Element {
  const pdfViewProps = {
    ...(pdfUrl !== undefined ? { pdfUrl } : {}),
    ...(onUploadPdf !== undefined && !readOnly ? { onUploadPdf } : {}),
    disabled: readOnly,
  };
  return (
    <div className={styles.col}>
      <VitalsStrip vitals={sheet.vitals} onChange={onChangeVitals} disabled={readOnly} />
      <PdfSheetView {...pdfViewProps} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// VitalsModeBody
// ---------------------------------------------------------------------------

interface VitalsModeBodyProps {
  sheet: SheetVitals;
  onChangeVitals: (patch: Partial<VitalsBlock>) => void;
  onChangeNotes: (notes: string) => void;
  readOnly: boolean;
}

function VitalsModeBody({ sheet, onChangeVitals, onChangeNotes, readOnly }: VitalsModeBodyProps): JSX.Element {
  return (
    <VitalsSheetView
      vitals={sheet.vitals}
      notes={sheet.notes}
      onChangeVitals={onChangeVitals}
      onChangeNotes={onChangeNotes}
      disabled={readOnly}
    />
  );
}

// ---------------------------------------------------------------------------
// SheetOwnerView props
// ---------------------------------------------------------------------------

interface SheetOwnerViewProps {
  current: CharacterSheetFullDTO;
  myRole: Role;
  isOwner: boolean;
  name: string;
  sheet: CharacterSheetData;
  saving: boolean;
  saveError: string | null;
  onNameChange: (v: string) => void;
  onIdentity: (patch: Partial<Identity5e>) => void;
  onSave: () => void;
  onSwitchMode: (next: SheetMode) => void;
  onChangeSheet: (next: CharacterSheetData) => void;
  onUploadPdfFile: (file: File) => void;
}

// ---------------------------------------------------------------------------
// SheetOwnerView — composes mode bodies
// ---------------------------------------------------------------------------

function SheetOwnerView({
  current, myRole, isOwner, name, sheet, saving, saveError,
  onNameChange, onIdentity, onSave, onSwitchMode, onChangeSheet, onUploadPdfFile,
}: SheetOwnerViewProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common', 'errors']);
  const readOnly = !isOwner;

  return (
    <section className={styles.sheet} aria-label={t('campaign:character.sheetLabel', { name: current.name })}>
      <IdentityHeader
        value={sheet.kind === '5e' ? sheet.identity : {}}
        characterName={name}
        onNameChange={onNameChange}
        onChange={onIdentity}
        disabled={readOnly}
      />

      {isGmViewer(myRole, isOwner) && (
        <span className={`eyebrow ${styles.readOnlyBadge}`}>{t('campaign:character.readOnlyBadge')}</span>
      )}

      {/* GM can switch mode locally on others' sheets to peek PDF/Vitals views;
          save is gated by readOnly so changes never persist. */}
      <SystemSelector value={sheet.kind} onChange={onSwitchMode} />

      {sheet.kind === '5e' && (
        <FiveESheetBody
          sheet={sheet}
          onChangeSheet={(next) => onChangeSheet(next)}
          readOnly={readOnly}
        />
      )}

      {sheet.kind === 'pdf' && (
        <PdfModeBody
          sheet={sheet}
          {...(current.pdfUrl !== undefined ? { pdfUrl: current.pdfUrl } : {})}
          onUploadPdf={onUploadPdfFile}
          onChangeVitals={(patch) => onChangeSheet({ ...sheet, vitals: { ...sheet.vitals, ...patch } })}
          readOnly={readOnly}
        />
      )}

      {sheet.kind === 'vitals' && (
        <VitalsModeBody
          sheet={sheet}
          onChangeVitals={(patch) => onChangeSheet({ ...sheet, vitals: { ...sheet.vitals, ...patch } })}
          onChangeNotes={(notes) => onChangeSheet({ ...sheet, notes })}
          readOnly={readOnly}
        />
      )}

      {!readOnly && (
        <div className={styles.actions}>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            {saving ? t('common:btn.saving') : t('common:btn.save')}
          </Button>
          {saveError && <p className={styles.error} role="alert">{saveError}</p>}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// CharacterSheet — data loader + Redux integration
// ---------------------------------------------------------------------------

interface CharacterSheetProps {
  characterId?: string | null;
  roomId: string;
  myRole: Role;
}

export default function CharacterSheet({ characterId, roomId, myRole }: CharacterSheetProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'common', 'errors']);
  const dispatch = useAppDispatch();
  const current = useAppSelector((s) => s.characters.current);
  const myUserId = useAppSelector((s) => s.session.currentUser?.id);

  const effectiveId = characterId ?? current?.id ?? null;

  const [name, setName] = useState('');
  const [sheet, setSheet] = useState<CharacterSheetData>(() => makeEmpty5eSheet());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!effectiveId) void dispatch(loadCharacters(roomId));
  }, [effectiveId, roomId, dispatch]);

  useEffect(() => {
    if (effectiveId) {
      void dispatch(loadCharacter(effectiveId));
    } else {
      dispatch(setCurrentCharacter(null));
    }
  }, [effectiveId, dispatch]);

  useEffect(() => {
    if (!current) return;
    setName(current.name);
    if (current.kind === 'full') setSheet(normaliseCharacterSheet(current.sheetData));
  }, [current]);

  const isOwner = useMemo(
    () => (current && myUserId ? current.ownerId === myUserId : false),
    [current, myUserId],
  );

  if (!effectiveId) return <CharacterListView roomId={roomId} myRole={myRole} />;
  if (!current) return <p>{t('campaign:character.loading')}</p>;
  if (current.kind === 'short') {
    return <ShortView name={current.name} {...(current.portraitUrl ? { portraitUrl: current.portraitUrl } : {})} />;
  }

  const id = effectiveId;

  function switchMode(next: SheetMode): void {
    setSheet((curr) => {
      if (curr.kind === next) return curr;
      return performSwitch(curr, next);
    });
  }

  const setIdentity = (patch: Partial<Identity5e>): void => {
    setSheet((s) => {
      if (s.kind !== '5e') return s;
      return { ...s, identity: { ...s.identity, ...patch } };
    });
  };

  const handleSave = (): void => {
    if (!isOwner) return;
    setSaving(true);
    setSaveError(null);
    void dispatch(updateCharacterThunk({ id, req: { name, sheetData: sheet } }))
      .unwrap()
      .catch((e: unknown) => {
        setSaveError(e instanceof Error ? e.message : t('errors:network.saveFailed'));
      })
      .finally(() => setSaving(false));
  };

  // Legacy input-event handler kept for any leftover <input type="file"> usage
  const handlePdf = (e: ChangeEvent<HTMLInputElement>): void => {
    if (!isOwner) return;
    const file = e.target.files?.[0];
    if (!file) return;
    void dispatch(uploadPdfThunk({ id, file }));
  };
  void handlePdf; // suppress unused-var in case no consumer remains

  const handleUploadPdfFile = (file: File): void => {
    if (!isOwner) return;
    void dispatch(uploadPdfThunk({ id, file }));
  };

  return (
    <SheetOwnerView
      current={current}
      myRole={myRole}
      isOwner={isOwner}
      name={name}
      sheet={sheet}
      saving={saving}
      saveError={saveError}
      onNameChange={setName}
      onIdentity={setIdentity}
      onSave={handleSave}
      onSwitchMode={switchMode}
      onChangeSheet={setSheet}
      onUploadPdfFile={handleUploadPdfFile}
    />
  );
}
