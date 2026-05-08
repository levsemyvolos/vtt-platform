import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../store';
import { setFogMode, setFogGmAlpha } from '../../store/canvasViewport';
import { fogShapeAdded } from '../../store/scene';
import { emitFogShapeAdd } from '../../api/socket';
import { recordUndo } from '../../store/undoDispatcher';
import { Button } from '../ui';
import { randomUUID } from '../../utils/uuid';
import styles from './FogControlsPopover.module.css';

interface FogControlsPopoverProps {
  roomId: string;
}

/**
 * Floating GM-only control panel for the fog tool (Ф3.3, shape-list model).
 * Lets the GM toggle hide/reveal mode, adjust GM-side opacity, and apply
 * hide-all/reveal-all in one click. The fog-local "Undo" button was removed
 * in Sess 7.5 — Ctrl+Z and the canvas-toolbar Undo button now handle that
 * uniformly across all canvas operations (no double-stack confusion).
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
    recordUndo({ kind: 'fog_add', shape });
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
    recordUndo({ kind: 'fog_add', shape });
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
        <Button variant="secondary" size="sm" onClick={handleHideAll}>
          {t('fog.hideAll')}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RotateCcw size={14} aria-hidden />}
          onClick={handleRevealAll}
        >
          {t('fog.revealAll')}
        </Button>
      </div>
    </div>
  );
}
