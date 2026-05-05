import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, RotateCcw, Undo2 } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import { setFogMode, setFogGmAlpha } from '../../store/canvasViewport';
import { fogShapeAdded, fogShapeRemoved } from '../../store/scene';
import { emitFogShapeAdd, emitFogShapeRemove } from '../../api/socket';
import { Button } from '../ui';
import { randomUUID } from '../../utils/uuid';
import styles from './FogControlsPopover.module.css';

interface FogControlsPopoverProps {
  roomId: string;
}

/**
 * Floating GM-only control panel for the fog tool (Ф3.3, shape-list model).
 * Lets the GM toggle hide/reveal mode, adjust GM-side opacity, undo the last
 * fog shape, and apply hide-all/reveal-all in one click.
 */
export default function FogControlsPopover({
  roomId,
}: FogControlsPopoverProps): JSX.Element | null {
  const { t } = useTranslation('gameroom');
  const dispatch = useAppDispatch();
  const fogMode = useAppSelector((s) => s.canvasViewport.fogMode);
  const fogGmAlpha = useAppSelector((s) => s.canvasViewport.fogGmAlpha);
  const scene = useAppSelector((s) => s.scene.current);

  if (!scene) return null;

  const sceneW = scene.gridSize * scene.gridWidth;
  const sceneH = scene.gridSize * scene.gridHeight;
  const shapes = scene.fogShapes ?? [];

  function handleHideAll(): void {
    if (!scene) return;
    const shape = {
      id: randomUUID(),
      x: 0, y: 0, w: sceneW, h: sceneH,
      mode: 'hide' as const,
      createdAt: Date.now(),
    };
    const payload = { roomId, sceneId: scene.id, shape };
    dispatch(fogShapeAdded(payload));
    emitFogShapeAdd(payload);
  }

  function handleRevealAll(): void {
    if (!scene) return;
    // Only meaningful when there's at least one hide shape to clear.
    if (!shapes.some((s) => s.mode === 'hide')) return;
    // Add a full-scene reveal shape instead of wiping the list — this makes
    // the operation undoable (the shape is the last in the list, so Undo removes it).
    const shape = {
      id: randomUUID(),
      x: 0, y: 0, w: sceneW, h: sceneH,
      mode: 'reveal' as const,
      createdAt: Date.now(),
    };
    const payload = { roomId, sceneId: scene.id, shape };
    dispatch(fogShapeAdded(payload));
    emitFogShapeAdd(payload);
  }

  function handleUndo(): void {
    if (!scene || !shapes.length) return;
    const last = shapes[shapes.length - 1]!;
    const payload = { roomId, sceneId: scene.id, shapeId: last.id };
    dispatch(fogShapeRemoved(payload));
    emitFogShapeRemove(payload);
  }

  return (
    <div className={styles.popover} role="region" aria-label={t('fog.title')}>
      <div className={styles.title}>{t('fog.title')}</div>

      <div className={styles.modeRow} role="group" aria-label={t('fog.mode')}>
        <button
          type="button"
          className={`${styles.modeBtn} ${fogMode === 'hide' ? styles.modeBtnActive : ''}`}
          aria-pressed={fogMode === 'hide'}
          onClick={() => dispatch(setFogMode('hide'))}
        >
          <EyeOff size={14} aria-hidden /> {t('fog.hide')}
        </button>
        <button
          type="button"
          className={`${styles.modeBtn} ${fogMode === 'reveal' ? styles.modeBtnActive : ''}`}
          aria-pressed={fogMode === 'reveal'}
          onClick={() => dispatch(setFogMode('reveal'))}
        >
          <Eye size={14} aria-hidden /> {t('fog.reveal')}
        </button>
      </div>

      <label className={styles.sliderRow}>
        <span>{t('fog.opacity')}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(fogGmAlpha * 100)}
          onChange={(e) => dispatch(setFogGmAlpha(Number(e.target.value) / 100))}
          aria-label={t('fog.opacity')}
        />
        <span className={styles.sliderVal}>{Math.round(fogGmAlpha * 100)}%</span>
      </label>

      <div className={styles.actionRow}>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleUndo}
          disabled={!shapes.length}
        >
          <Undo2 size={14} aria-hidden /> {t('fog.undo')}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleHideAll}>
          {t('fog.hideAll')}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleRevealAll}>
          <RotateCcw size={14} aria-hidden /> {t('fog.revealAll')}
        </Button>
      </div>
    </div>
  );
}
