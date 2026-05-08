import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useAppDispatch } from '../../store';
import { createScene, loadScenes } from '../../store/scenes';
import Modal from '../common/Modal';
import { Button, Input } from '../ui';
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

  return (
    <Modal
      title={t('room:scenes.modal.heading')}
      onClose={onClose}
      icon={<Plus size={20} strokeWidth={1.5} className="icon-accent icon-primary" />}
    >
      <form onSubmit={(e) => void onSubmit(e)} aria-label={t('room:scenes.modal.formLabel')} className={styles.form} noValidate>
        <Input
          id="scene-name"
          label={t('room:scenes.modal.sceneName')}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          autoFocus
          fullWidth
        />
        <div className={styles.grid}>
          <Input
            id="scene-grid-width"
            label={t('room:scenes.modal.gridWidth')}
            type="number"
            min={1}
            max={100}
            value={gridWidth}
            onChange={(e) => setGridWidth(Number(e.target.value))}
            fullWidth
          />
          <Input
            id="scene-grid-height"
            label={t('room:scenes.modal.gridHeight')}
            type="number"
            min={1}
            max={100}
            value={gridHeight}
            onChange={(e) => setGridHeight(Number(e.target.value))}
            fullWidth
          />
          <Input
            id="scene-grid-size"
            label={t('room:scenes.modal.gridSize')}
            type="number"
            min={20}
            max={200}
            value={gridSize}
            onChange={(e) => setGridSize(Number(e.target.value))}
            fullWidth
          />
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('common:btn.cancel')}
          </Button>
          <Button type="submit" variant="primary" isLoading={busy}>
            {busy ? t('common:btn.creating') : t('common:btn.create')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
