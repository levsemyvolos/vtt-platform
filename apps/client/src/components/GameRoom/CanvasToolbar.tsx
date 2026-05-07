import { useTranslation } from 'react-i18next';
import {
  Music,
  Sparkles,
  PencilRuler,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Eraser,
} from 'lucide-react';
import type { Role } from '@vtt/shared';
import { zoomIn, zoomOut, fit, setZoom, setBrushSize, BRUSH_SIZE_BOUNDS } from '../../store/canvasViewport';
import { startEditing } from '../../store/room';
import { clearDrawStrokes } from '../../store/scene';
import { emitDrawClear } from '../../api/socket';
import { useAppDispatch, useAppSelector } from '../../store';
import { performUndo, performRedo, recordUndo } from '../../store/undoDispatcher';
import { IconButton } from '../ui';
import ToolPicker from '../GameCanvas/ToolPicker';
import type { SidebarTab } from './types';
import styles from './CanvasToolbar.module.css';

interface CanvasToolbarProps {
  myRole: Role;
  onOpenTab: (tab: SidebarTab) => void;
  onOpenAssistant: () => void;
}

export default function CanvasToolbar({
  myRole,
  onOpenTab,
  onOpenAssistant,
}: CanvasToolbarProps): JSX.Element {
  const dispatch = useAppDispatch();
  const { t } = useTranslation('gameroom');
  const zoom = useAppSelector((s) => s.canvasViewport.zoom);
  const currentSceneId = useAppSelector((s) => s.scene.current?.id ?? null);
  const currentRoomId = useAppSelector((s) => s.room.currentRoom?.id ?? null);
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);
  const brushSize = useAppSelector((s) => s.canvasViewport.brushSize);
  const canUndo = useAppSelector((s) => s.undoHistory.past.length > 0);
  const canRedo = useAppSelector((s) => s.undoHistory.future.length > 0);
  const strokeObjects = useAppSelector((s) =>
    (s.scene.current?.annotations.objects ?? []).filter((o) => o.type === 'stroke'),
  );
  const hasStrokes = strokeObjects.length > 0;

  const zoomPct = `${Math.round(zoom * 100)}%`;

  function handleDrawClear(): void {
    if (!currentRoomId || !currentSceneId || !hasStrokes) return;
    // Sess 7.5 — snapshot stroke objects BEFORE clear so undo can restore them
    // via per-object upsert (preserves transform/lock state).
    const snapshot = strokeObjects.map((o) => JSON.parse(JSON.stringify(o)) as typeof o);
    dispatch(clearDrawStrokes());
    emitDrawClear(currentRoomId, currentSceneId);
    recordUndo({ kind: 'draw_clear', objects: snapshot });
  }

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Canvas tools">
      <div className={styles.tools}>
        <ToolPicker myRole={myRole} />

        {activeTool === 'draw' && myRole === 'GM' && (
          <>
            <span className={styles.divider} aria-hidden />
            <label className={styles.brushSize} title={t('toolbar.brushSize')}>
              <span className={styles.brushSizeValue} aria-live="polite">{brushSize}px</span>
              <input
                type="range"
                min={BRUSH_SIZE_BOUNDS.min}
                max={BRUSH_SIZE_BOUNDS.max}
                step={1}
                value={brushSize}
                onChange={(e) => dispatch(setBrushSize(Number(e.target.value)))}
                aria-label={t('toolbar.brushSize')}
              />
            </label>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t('toolbar.clearStrokes')}
              title={t('toolbar.clearStrokes')}
              disabled={!hasStrokes}
              onClick={handleDrawClear}
            >
              <Eraser size={16} />
            </IconButton>
          </>
        )}

        <span className={styles.divider} aria-hidden />

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.music')}
          title={t('toolbar.music')}
          onClick={() => onOpenTab('audio')}
        >
          <Music size={16} />
        </IconButton>

        {myRole === 'GM' && (
          <IconButton
            variant="ghost"
            size="sm"
            aria-label={t('toolbar.ai')}
            title={t('toolbar.ai')}
            onClick={onOpenAssistant}
          >
            <Sparkles size={16} />
          </IconButton>
        )}

        {myRole === 'GM' && (
          <>
            <span className={styles.divider} aria-hidden />
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t('toolbar.undo')}
              title={t('toolbar.undo')}
              disabled={!canUndo}
              onClick={() => performUndo()}
            >
              <Undo2 size={16} />
            </IconButton>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t('toolbar.redo')}
              title={t('toolbar.redo')}
              disabled={!canRedo}
              onClick={() => performRedo()}
            >
              <Redo2 size={16} />
            </IconButton>
          </>
        )}

        {myRole === 'GM' && currentSceneId && (
          <>
            <span className={styles.divider} aria-hidden />
            <IconButton
              variant="ghost"
              size="sm"
              aria-label={t('topBar.editScene')}
              title={t('topBar.editScene')}
              onClick={() => { dispatch(startEditing(currentSceneId)); }}
            >
              <PencilRuler size={16} />
            </IconButton>
          </>
        )}
      </div>

      <div className={styles.zoom}>
        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.zoomOut')}
          title={t('toolbar.zoomOut')}
          onClick={() => dispatch(zoomOut())}
        >
          <ZoomOut size={14} />
        </IconButton>

        <button
          type="button"
          className={styles.zoomPct}
          onClick={() => dispatch(setZoom(1))}
          title={t('toolbar.zoomReset')}
          aria-label={t('toolbar.zoomReset')}
        >
          {zoomPct}
        </button>

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.zoomIn')}
          title={t('toolbar.zoomIn')}
          onClick={() => dispatch(zoomIn())}
        >
          <ZoomIn size={14} />
        </IconButton>

        <IconButton
          variant="ghost"
          size="sm"
          aria-label={t('toolbar.zoomFit')}
          title={t('toolbar.zoomFit')}
          onClick={() => dispatch(fit())}
        >
          <Maximize2 size={14} />
        </IconButton>
      </div>
    </div>
  );
}
