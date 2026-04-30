import { useState, type FormEvent } from 'react';
import { useAppDispatch } from '../../store';
import { createScene, loadScenes } from '../../store/scenes';

interface CreateSceneModalProps {
  roomId: string;
  onClose: () => void;
}

export default function CreateSceneModal({ roomId, onClose }: CreateSceneModalProps): JSX.Element {
  const dispatch = useAppDispatch();
  const [name, setName] = useState('');
  const [gridWidth, setGridWidth] = useState(24);
  const [gridHeight, setGridHeight] = useState(18);
  const [gridSize, setGridSize] = useState(70);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!name.trim()) return "Назва сцени обов'язкова";
    if (gridWidth < 1 || gridWidth > 100) return 'Ширина: від 1 до 100 кліток';
    if (gridHeight < 1 || gridHeight > 100) return 'Висота: від 1 до 100 кліток';
    if (gridSize < 20 || gridSize > 200) return 'Розмір клітинки: 20–200 px';
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
      // loadScenes is a safety refresh; createScene.fulfilled already pushes to list
      void dispatch(loadScenes(roomId));
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Помилка створення сцени');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Нова сцена" className="modal-backdrop">
      <div className="modal">
        <h2>Нова сцена</h2>
        <form onSubmit={(e) => void onSubmit(e)} aria-label="форма нової сцени" noValidate>
          <div className="field">
            <label htmlFor="scene-name">Назва *</label>
            <input
              id="scene-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="scene-grid-width">Ширина (кліток)</label>
            <input
              id="scene-grid-width"
              type="number"
              min={1}
              max={100}
              value={gridWidth}
              onChange={(e) => setGridWidth(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="scene-grid-height">Висота (кліток)</label>
            <input
              id="scene-grid-height"
              type="number"
              min={1}
              max={100}
              value={gridHeight}
              onChange={(e) => setGridHeight(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="scene-grid-size">Розмір клітинки (px)</label>
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
            <p role="alert" className="modal__error">
              {error}
            </p>
          )}

          <div className="modal__actions">
            <button type="button" onClick={onClose} disabled={busy}>
              Скасувати
            </button>
            <button type="submit" disabled={busy}>
              {busy ? 'Створення…' : 'Створити'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
