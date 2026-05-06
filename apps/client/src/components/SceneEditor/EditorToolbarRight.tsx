import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '../../store';
import { upsertToken } from '../../store/scene';
import { apiUpdateToken } from '../../api/scenes';
import styles from './EditorToolbarRight.module.css';

export default function EditorToolbarRight(): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const selectedId = useAppSelector((s) => s.scene.selectedTokenId);
  const token = useAppSelector(
    (s) => s.scene.current?.tokens.find((tk) => tk.id === selectedId),
  );

  const [name, setName] = useState('');
  const [hp, setHp] = useState('');
  const [maxHp, setMaxHp] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setName(token.name);
    setHp(token.hp != null ? String(token.hp) : '');
    setMaxHp(token.maxHp != null ? String(token.maxHp) : '');
    setError(null);
  }, [token]);

  async function handleSave(): Promise<void> {
    if (!selectedId) return;
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiUpdateToken(selectedId, {
        name: name.trim() || token.name,
        hp: hp !== '' ? Number(hp) : null,
        maxHp: maxHp !== '' ? Number(maxHp) : null,
      });
      dispatch(upsertToken(updated));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors:network.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className={styles.toolbar} aria-label={t('room:sceneEditor.rightToolbar.heading')}>
      <p className={styles.heading}>{t('room:sceneEditor.rightToolbar.heading')}</p>

      {!token ? (
        <p className={styles.empty} data-testid="no-token-selected">
          {t('room:sceneEditor.properties.noSelection')}
        </p>
      ) : (
        <div className={styles.form} data-testid="token-properties">
          <label className={styles.field}>
            <span className={styles.label}>{t('common:label.name')}</span>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('common:label.name')}
            />
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>HP</span>
              <input
                type="number"
                className={styles.input}
                value={hp}
                onChange={(e) => setHp(e.target.value)}
                aria-label="HP"
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Max HP</span>
              <input
                type="number"
                className={styles.input}
                value={maxHp}
                onChange={(e) => setMaxHp(e.target.value)}
                aria-label="Max HP"
              />
            </label>
          </div>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? t('common:btn.saving') : t('common:btn.save')}
          </button>
        </div>
      )}
    </aside>
  );
}
