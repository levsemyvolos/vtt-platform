import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { DiceMode } from '@vtt/shared';
import { emitDiceRoll } from '../../api/socket';
import { Button, IconButton, Tabs, type TabItem } from '../ui';
import styles from './DiceTool.module.css';

const DIES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
const DIGITS = ['1', '2', '3', '4', '5', '6'] as const;
type Die = (typeof DIES)[number];
type Digit = (typeof DIGITS)[number];

interface DiceToolProps {
  roomId: string;
  open: boolean;
  onClose: () => void;
}

export default function DiceTool({ roomId, open, onClose }: DiceToolProps): JSX.Element | null {
  const { t } = useTranslation(['room', 'errors']);
  const [count, setCount] = useState<Digit | null>(null);
  const [die, setDie] = useState<Die | null>(null);
  const [mode, setMode] = useState<DiceMode>('normal');
  const [secret, setSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const expression = die ? `${count ?? '1'}${die}` : '';

  const MODE_TABS: ReadonlyArray<TabItem<DiceMode>> = [
    { id: 'normal', label: t('dice.modes.normalShort') },
    { id: 'advantage', label: t('dice.modes.advantageShort') },
    { id: 'disadvantage', label: t('dice.modes.disadvantageShort') },
  ];

  function pickDigit(d: Digit): void {
    setCount((prev) => (prev === d ? null : d));
  }

  function pickDie(d: Die): void {
    setDie((prev) => (prev === d ? null : d));
  }

  async function onRoll(): Promise<void> {
    if (!die) return;
    setBusy(true);
    setError(null);
    try {
      const expr = `${count ?? '1'}${die}`;
      await emitDiceRoll({ roomId, expression: expr, mode, secret });
      setCount(null);
      setDie(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:network.rollFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.tool} role="dialog" aria-label={t('dice.toolHeading')}>
      <header className={styles.header}>
        <span className={styles.title}>{t('dice.toolHeading')}</span>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label={t('dice.closeLabel')}
        >
          ✕
        </button>
      </header>

      <div className={styles.row} role="group" aria-label={t('dice.digitGroup')}>
        {DIGITS.map((d) => (
          <button
            key={d}
            type="button"
            className={`${styles.cellBtn}${count === d ? ` ${styles.cellBtnActive}` : ''}`}
            onClick={() => { pickDigit(d); }}
            disabled={busy}
            aria-pressed={count === d}
          >
            {d}
          </button>
        ))}
      </div>

      <div className={styles.row} role="group" aria-label={t('dice.dieGroup')}>
        {DIES.map((d) => (
          <button
            key={d}
            type="button"
            className={`${styles.cellBtn}${die === d ? ` ${styles.cellBtnActive}` : ''}`}
            onClick={() => { pickDie(d); }}
            disabled={busy}
            aria-pressed={die === d}
          >
            {d}
          </button>
        ))}
      </div>

      <p className={styles.expression} aria-live="polite">
        {expression || t('dice.noExpression')}
      </p>

      <div className={styles.modeRow}>
        <Tabs
          variant="segmented"
          items={MODE_TABS}
          value={mode}
          onChange={setMode}
          ariaLabel={t('dice.modeLabel')}
        />
        <IconButton
          variant="ghost"
          size="sm"
          isActive={secret}
          onClick={() => { setSecret((s) => !s); }}
          aria-label={t('dice.secretToggleLabel')}
          title={t('dice.secret')}
        >
          <Lock size={14} />
        </IconButton>
      </div>

      <Button
        variant="primary"
        onClick={() => { void onRoll(); }}
        disabled={busy || !die}
        aria-busy={busy}
        aria-label={expression ? t('dice.rollAria', { expression }) : t('dice.rollBtn')}
      >
        {t('dice.rollBtn')}
      </Button>

      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}
