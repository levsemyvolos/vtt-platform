import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '../../store';
import { createScene, loadScenes } from '../../store/scenes';
import styles from './CreateSceneModal.module.css';

interface CreateSceneModalProps {
  roomId: string;
  onClose: () => void;
}

export default function CreateSceneModal({ roomId, onClose }: CreateSceneModalProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation(['room', 'common', 'errors']);
  const [name, setName] = useState('');
  const [gridWidth, setGridWidth] = useState(24);
  const [gridHeight, setGridHeight] = useState(18);
  const [gridSize, setGridSize] = useState(70);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!name.trim()) return t('errors:validation.sceneNameRequired');
    if (gridWidth < 1 || gridWidth > 100) return t('errors:validation.gridWidthRange');
    if (gridHeight < 1 || gridHeight > 100) return t('errors:validation.gridHeightRange');
    if (gridSize < 20 || gridSize > 200) return t('errors:validation.gridSizeRange');
    return null;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    try {
      await dispatch(
        createScene({ roomId, dto: { name: name.trim(), gridWidth, gridHeight, gridSize } }),
      ).unwrap();
      void dispatch(loadScenes(roomId));
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : t('errors:network.createFailed'));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('room:scenes.modal.dialogLabel')}
      className={styles.backdrop}
      tabIndex={-1}
    >
      <div className={styles.dialog}>
        <h2>{t('room:scenes.modal.heading')}</h2>
        <form onSubmit={(e) => void onSubmit(e)} aria-label={t('room:scenes.modal.formLabel')} noValidate>
          <div className={styles.field}>
            <label htmlFor="scene-name">{t('room:scenes.modal.sceneName')}</label>
            <input
              id="scene-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="scene-grid-width">{t('room:scenes.modal.gridWidth')}</label>
            <input
              id="scene-grid-width"
              type="number"
              min={1}
              max={100}
              value={gridWidth}
              onChange={(e) => setGridWidth(Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="scene-grid-height">{t('room:scenes.modal.gridHeight')}</label>
            <input
              id="scene-grid-height"
              type="number"
              min={1}
              max={100}
              value={gridHeight}
              onChange={(e) => setGridHeight(Number(e.target.value))}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="scene-grid-size">{t('room:scenes.modal.gridSize')}</label>
            <input
              id="scene-grid-size"
              type="number"
              min={20}
              max={200}
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
            />
          </div>

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose} disabled={busy}>
              {t('common:btn.cancel')}
            </button>
            <button type="submit" className={styles.btnSubmit} disabled={busy}>
              {busy ? t('common:btn.creating') : t('common:btn.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
