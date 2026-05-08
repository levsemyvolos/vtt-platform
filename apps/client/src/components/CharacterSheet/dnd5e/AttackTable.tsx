import { useTranslation } from 'react-i18next';
import type { AttackEntry5e } from '@vtt/shared';
import styles from './dnd5e.module.css';

export interface AttackTableProps {
  attacks: AttackEntry5e[];
  onChange: (next: AttackEntry5e[]) => void;
  disabled?: boolean;
}

const MAX_ATTACKS = 5;

function emptyAttack(): AttackEntry5e {
  return { name: '', atkBonus: '', damage: '' };
}

/** Up to 5 attack rows with name, attack bonus, damage; add and per-row delete buttons. */
export default function AttackTable({
  attacks,
  onChange,
  disabled = false,
}: AttackTableProps) {
  const { t } = useTranslation('campaign');

  function updateRow(index: number, patch: Partial<AttackEntry5e>) {
    const next = attacks.map((a, i) => (i === index ? { ...a, ...patch } : a));
    onChange(next);
  }

  function deleteRow(index: number) {
    onChange(attacks.filter((_, i) => i !== index));
  }

  function addRow() {
    if (attacks.length >= MAX_ATTACKS) return;
    onChange([...attacks, emptyAttack()]);
  }

  return (
    <div>
      <table className={styles.attackTable}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Atk Bonus</th>
            <th>Damage</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {attacks.map((attack, i) => (
            <tr key={i}>
              <td>
                <input
                  type="text"
                  value={attack.name}
                  disabled={disabled}
                  aria-label={`Attack ${i + 1} name`}
                  onChange={(e) => updateRow(i, { name: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={attack.atkBonus}
                  disabled={disabled}
                  aria-label={`Attack ${i + 1} bonus`}
                  onChange={(e) => updateRow(i, { atkBonus: e.target.value })}
                />
              </td>
              <td>
                <input
                  type="text"
                  value={attack.damage}
                  disabled={disabled}
                  aria-label={`Attack ${i + 1} damage`}
                  onChange={(e) => updateRow(i, { damage: e.target.value })}
                />
              </td>
              <td>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${t('dnd5e.actions.removeAttack')} ${i + 1}`}
                  onClick={() => deleteRow(i)}
                >
                  &times;
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {attacks.length < MAX_ATTACKS && (
        <button
          type="button"
          disabled={disabled}
          aria-label={t('dnd5e.actions.addAttack')}
          onClick={addRow}
        >
          {t('dnd5e.actions.addAttack')}
        </button>
      )}
    </div>
  );
}
