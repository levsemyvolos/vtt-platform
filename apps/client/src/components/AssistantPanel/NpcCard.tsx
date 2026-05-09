import { useTranslation } from 'react-i18next';
import type { NpcResponse } from '@vtt/shared';
import styles from './NpcCard.module.css';

interface Props {
  npc: NpcResponse;
}

/**
 * S6.2 / P5.2 — render NPC JSON output as a structured card with 5 sections
 * (core / appearance / roleplay / psychology+narrative / statblock).
 *
 * Rendered by ConversationView.MessageBubble when an assistant message of
 * `npc-description` context successfully parses as JSON; otherwise the
 * bubble falls back to ReactMarkdown so legacy markdown-mode messages
 * (saved before this session) still display normally.
 *
 * Sentinel handling: hp/ac of -1 indicates the rule-7 license-bounded
 * refusal; the statblock numeric grid is hidden and the refusal sentence
 * (carried in `special_ability`) is shown alone in the slot.
 */
export default function NpcCard({ npc }: Props): JSX.Element {
  const { t } = useTranslation('assistant');
  const sb = npc.statblock;
  const isRefusal = sb.hp === -1 || sb.ac === -1;

  return (
    <article className={styles.card} aria-label={t('npcCard.label')}>
      <header className={styles.header}>
        <h3 className={styles.name}>{npc.npc_core.full_name}</h3>
        <p className={styles.concept}>{npc.npc_core.concept}</p>
      </header>

      <Section title={t('npcCard.sections.appearance')}>
        <p>{npc.npc_core.appearance}</p>
      </Section>

      <Section title={t('npcCard.sections.roleplay')}>
        <Field label={t('npcCard.fields.verbalMannerism')} value={npc.roleplay.verbal_mannerism} />
        <Field label={t('npcCard.fields.physicalMannerism')} value={npc.roleplay.physical_mannerism} />
        <Field label={t('npcCard.fields.motivation')} value={npc.roleplay.motivation} />
        <Field label={t('npcCard.fields.sampleDialogue')} value={`"${npc.roleplay.sample_dialogue}"`} italic />
      </Section>

      <Section title={t('npcCard.sections.psychology')}>
        <Field label={t('npcCard.fields.dominantTrait')} value={npc.psychology.dominant_trait} />
        <Field label={t('npcCard.fields.fatalFlaw')} value={npc.psychology.fatal_flaw} />
        <Field label={t('npcCard.fields.contradiction')} value={npc.psychology.contradiction} />
      </Section>

      <Section title={t('npcCard.sections.narrative')}>
        <Field label={t('npcCard.fields.secret')} value={npc.narrative.secret} />
        <Field label={t('npcCard.fields.plotHook')} value={npc.narrative.plot_hook} />
      </Section>

      <Section title={`${t('npcCard.sections.statblock')} (${sb.system}, ${sb.cr_or_level})`}>
        {isRefusal ? (
          <p className={styles.refusal}>{sb.special_ability}</p>
        ) : (
          <>
            <div className={styles.statRow}>
              <Stat label={t('npcCard.stats.hp')} value={String(sb.hp)} />
              <Stat label={t('npcCard.stats.ac')} value={String(sb.ac)} />
              <Stat label={t('npcCard.stats.speed')} value={sb.speed} />
            </div>
            <Field label={t('npcCard.fields.primaryAttack')} value={sb.primary_attack} />
            <Field label={t('npcCard.fields.specialAbility')} value={sb.special_ability} />
            {sb.assumptions && sb.assumptions.toLowerCase() !== 'немає' && (
              <Field label={t('npcCard.fields.assumptions')} value={sb.assumptions} muted />
            )}
          </>
        )}
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className={styles.section}>
      <h4 className={styles.sectionTitle}>{title}</h4>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  );
}

function Field({ label, value, italic, muted }: { label: string; value: string; italic?: boolean; muted?: boolean }): JSX.Element {
  const valueClass = [
    styles.fieldValue,
    italic ? styles.italic : '',
    muted ? styles.muted : '',
  ].filter(Boolean).join(' ');
  return (
    <p className={styles.field}>
      <span className={styles.fieldLabel}>{label}:</span>{' '}
      <span className={valueClass}>{value}</span>
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{value}</span>
    </div>
  );
}

/**
 * Try to parse a stored assistant message body as `NpcResponse`.
 * Returns `null` if the content doesn't look like JSON or any required key
 * is missing — in that case the caller falls back to markdown rendering.
 */
export function tryParseNpc(content: string): NpcResponse | null {
  const trimmed = content.trim();
  if (trimmed.length === 0 || trimmed[0] !== '{') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isNpcShape(parsed)) return null;
  return parsed;
}

function isNpcShape(value: unknown): value is NpcResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    isObject(v.npc_core) &&
    isObject(v.roleplay) &&
    isObject(v.psychology) &&
    isObject(v.narrative) &&
    isObject(v.statblock)
  );
}

function isObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}
