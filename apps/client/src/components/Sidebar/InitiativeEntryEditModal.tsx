import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InitiativeEntryDTO } from '@vtt/shared';
import { apiUpdateEntry } from '../../api/initiative';
import Modal from '../common/Modal';
import styles from './InitiativeEntryEditModal.module.css';

interface Props {
  entry: InitiativeEntryDTO;
  onClose: () => void;
}

export default function InitiativeEntryEditModal({ entry, onClose }: Props): JSX.Element {
  const { t } = useTranslation(['campaign', 'common', 'errors']);
  const [name, setName] = useState(entry.name);
  const [initiative, setInitiative] = useState(String(entry.initiative));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(): Promise<void> {
    const trimmedName = name.trim();
    const initNum = Number(initiative.trim());
    if (trimmedName.length === 0 || trimmedName.length > 64) {
      setError(t('initiative.invalidName', { defaultValue: 'Name must be 1–64 chars' }));
      return;
    }
    if (!Number.isFinite(initNum)) {
      setError(t('initiative.invalidValue', { defaultValue: 'Initiative must be a number' }));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const patch: { name?: string; initiative?: number } = {};
      if (trimmedName !== entry.name) patch.name = trimmedName;
      if (initNum !== entry.initiative) patch.initiative = initNum;
      if (Object.keys(patch).length > 0) {
        await apiUpdateEntry(entry.id, patch);
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors:network.saveFailed', { defaultValue: 'Save failed' }));
      setSaving(false);
    }
  }

  return (
    <Modal title={t('initiative.editEntry', { defaultValue: 'Edit entry' })} onClose={onClose}>
      <div className={styles.content}>
        <label className={styles.field}>
          <span className={styles.label}>{t('initiative.nameLabel', { defaultValue: 'Name' })}</span>
          <input
            type="text"
            className={styles.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            autoFocus
            aria-label={t('initiative.nameLabel', { defaultValue: 'Name' })}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('initiative.valueLabel', { defaultValue: 'Initiative' })}</span>
          <input
            type="number"
            className={styles.input}
            value={initiative}
            onChange={(e) => setInitiative(e.target.value)}
            aria-label={t('initiative.valueLabel', { defaultValue: 'Initiative' })}
          />
        </label>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.btnCancel}
            onClick={onClose}
            disabled={saving}
          >
            {t('common:btn.cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className={styles.btnSave}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? t('common:btn.saving', { defaultValue: 'Saving…' }) : t('common:btn.save', { defaultValue: 'Save' })}
          </button>
        </div>
      </div>
    </Modal>
  );
}
