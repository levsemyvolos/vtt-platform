import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Role, CharacterSheetDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { loadCharacters, createCharacterThunk } from '../../store/characters';
import { Avatar, Button, Input } from '../ui';
import styles from './CharacterStatStrip.module.css';
import { normaliseCharacterSheet } from './dnd5e/normalise';
import { initiativeMod, formatMod, extractVitals } from './dnd5e/calc';

interface Props {
  roomId: string;
  myRole: Role;
  myCharacterId: string | null;
  onOpenSheet: (characterId: string | null) => void;
}

interface QuickStats {
  name: string;
  hp: number | null;
  maxHp: number | null;
  ac: number | null;
  initMod: number;
  speed: number | null;
}

function extractStats(character: CharacterSheetDTO): QuickStats {
  if (character.kind !== 'full') {
    return { name: character.name, hp: null, maxHp: null, ac: null, initMod: 0, speed: null };
  }
  const sheet = normaliseCharacterSheet(character.sheetData);
  const vitals = extractVitals(sheet);
  let initMod = 0;
  if (sheet.kind === '5e') {
    initMod = initiativeMod(sheet);
  } else if (typeof vitals.initiativeOverride === 'number') {
    initMod = vitals.initiativeOverride;
  }
  return {
    name: character.name,
    hp: vitals.hp ?? null,
    maxHp: vitals.maxHp ?? null,
    ac: vitals.ac ?? null,
    initMod,
    speed: vitals.speed ?? null,
  };
}

interface InlineCreateProps {
  roomId: string;
}

function InlineCreateCharacter({ roomId }: InlineCreateProps): JSX.Element {
  const { t } = useTranslation(['campaign', 'errors']);
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 64) {
      setError(t('campaign:character.invalidName', { defaultValue: 'Name must be 1–64 characters' }));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dispatch(
        createCharacterThunk({ roomId, req: { name: trimmed } }),
      ).unwrap();
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors:network.saveFailed', { defaultValue: 'Save failed' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.empty}>
      <p className={styles.emptyText}>
        {t('campaign:character.noOwnCharacter', { defaultValue: 'No character yet.' })}
      </p>
      <Input
        type="text"
        value={name}
        onChange={(e) => { setName(e.target.value); }}
        placeholder={t('campaign:character.namePlaceholder', { defaultValue: 'Character name' })}
        onKeyDown={(e) => { if (e.key === 'Enter') { void handleCreate(); } }}
        maxLength={64}
        disabled={busy}
      />
      <Button
        variant="primary"
        size="sm"
        onClick={() => { void handleCreate(); }}
        disabled={busy || name.trim().length === 0}
      >
        {t('campaign:character.createBtn', { defaultValue: 'Create character' })}
      </Button>
      {error !== null && (
        <p className={styles.errorText} role="alert">{error}</p>
      )}
    </div>
  );
}

interface CharacterCardProps {
  character: CharacterSheetDTO;
  onOpenSheet: (id: string) => void;
  ownerName?: string;
}

function CharacterCard({ character, onOpenSheet, ownerName }: CharacterCardProps): JSX.Element {
  const { t } = useTranslation('campaign');
  const stats = extractStats(character);
  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <Avatar size="sm" name={stats.name} />
        <div>
          <span className={styles.name}>{stats.name}</span>
          {ownerName !== undefined && (
            <span className={styles.ownerBadge}>· {ownerName}</span>
          )}
        </div>
      </div>
      <div className={styles.metrics}>
        {(() => {
          const lowHp = stats.hp !== null && stats.maxHp !== null && stats.maxHp > 0 && stats.hp / stats.maxHp < 0.4;
          return (
            <span className={`${styles.metric}${lowHp ? ` ${styles.metricFire}` : ''}`}>
              {stats.hp === null && stats.maxHp === null
                ? 'HP —'
                : `HP ${stats.hp ?? '—'}/${stats.maxHp ?? '—'}`}
            </span>
          );
        })()}
        <span className={`${styles.metric} ${styles.metricSteel}`}>AC {stats.ac ?? '—'}</span>
        <span className={styles.metric}>Init {formatMod(stats.initMod)}</span>
        <span className={styles.metric}>{stats.speed ?? '—'}ft</span>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={() => { onOpenSheet(character.id); }}
        aria-label={t('character.openSheet', { defaultValue: 'Open Sheet' })}
      >
        {t('character.openSheet', { defaultValue: 'Open Sheet' })}
      </Button>
    </div>
  );
}

export default function CharacterStatStrip({
  roomId, myRole, onOpenSheet,
}: Props): JSX.Element {
  const { t } = useTranslation('campaign');
  const dispatch = useAppDispatch();
  const isGM = myRole === 'GM';

  const myUserId = useAppSelector((s) => s.session.currentUser?.id ?? null);
  const ownCharacters = useAppSelector((s) =>
    myUserId != null ? s.characters.items.filter((c) => c.ownerId === myUserId) : [],
  );
  const allCharacters = useAppSelector((s) => s.characters.items);
  const members = useAppSelector((s) => s.room.members);

  // Load full list for all users so WSS broadcasts populate the store.
  useEffect(() => {
    void dispatch(loadCharacters(roomId));
  }, [dispatch, roomId]);

  const [showCreate, setShowCreate] = useState(false);

  function ownerName(ownerId: string): string {
    return members.find((m) => m.userId === ownerId)?.name ?? '?';
  }

  const otherCharacters = allCharacters.filter((c) => c.ownerId !== myUserId);

  return (
    <div className={styles.strip}>
      {/* Own characters section */}
      {ownCharacters.map((c) => (
        <CharacterCard key={c.id} character={c} onOpenSheet={onOpenSheet} />
      ))}

      {/* Inline create — shown when user has no characters, or explicitly toggled */}
      {(ownCharacters.length === 0 || showCreate) && (
        <InlineCreateCharacter roomId={roomId} />
      )}

      {/* "+ Create another" when user already has at least one character */}
      {ownCharacters.length > 0 && !showCreate && (
        <button
          type="button"
          className={styles.createAnotherBtn}
          onClick={() => { setShowCreate(true); }}
        >
          {t('character.createAnotherBtn', { defaultValue: '+ Create another' })}
        </button>
      )}

      {/* GM list — all characters not owned by this user */}
      {isGM && otherCharacters.length > 0 && (
        <div className={styles.gmList}>
          <span className={styles.gmListLabel}>
            {t('character.allCharactersLabel', { defaultValue: 'All characters' })}
          </span>
          {otherCharacters.map((c) => (
            <CharacterCard
              key={c.id}
              character={c}
              onOpenSheet={onOpenSheet}
              ownerName={ownerName(c.ownerId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
