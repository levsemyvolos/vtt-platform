import { useEffect, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { store } from '../../store';
import { selectToken, deselectSceneObject, appendSceneObject } from '../../store/scene';
import { emitObjectDelete, emitObjectDuplicate } from '../../api/socket';
import { buildClonedObject } from '../../store/sceneObjectClone';
import type { CanvasTool } from '../../store/canvasViewport';
import { useTheme } from '../../hooks/useTheme';
import { useToolHandlers } from '../../hooks/useToolHandlers';
import BackgroundLayer from './layers/BackgroundLayer';
import TokenLayer from './layers/TokenLayer';
import AnnotationLayer from './layers/AnnotationLayer';
import FogOfWarLayer from './layers/FogOfWarLayer';
import FogMarqueeLayer, { type FogMarquee } from './layers/FogMarqueeLayer';
import AddTokenButton from './AddTokenButton';
import TextAnnotationModal from './TextAnnotationModal';
import TokenEditModal from '../Token/TokenEditModal';
import TokenContextMenu from '../Token/TokenContextMenu';
import SceneObjectContextMenu from './SceneObjectContextMenu';
import styles from './GameCanvas.module.css';

export interface GameCanvasProps {
  scene: SceneDTO;
  myRole: Role;
  myUserId: string;
  /** 'edit' enables fog-drag for GM and token-click-to-select. Default: 'play'. */
  mode?: 'edit' | 'play';
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.08;

/** Pure helpers — extracted to keep component cyclomatic complexity ≤10. */
const GM_TOOL_CURSORS: Partial<Record<CanvasTool, string>> = { text: 'text', image: 'crosshair', fog: 'cell' };

function getCursorStyle(activeTool: CanvasTool, myRole: Role): string {
  if (activeTool === 'ping' || activeTool === 'ruler' || activeTool === 'draw') return 'crosshair';
  if (myRole === 'GM') return GM_TOOL_CURSORS[activeTool] ?? 'default';
  return 'default';
}

function isCanvasDraggable(activeTool: CanvasTool): boolean {
  return activeTool !== 'ruler' && activeTool !== 'draw' && activeTool !== 'text' && activeTool !== 'image' && activeTool !== 'fog';
}

function fogEditActive(myRole: Role, mode: 'edit' | 'play', activeTool: string): boolean {
  return myRole === 'GM' && (mode === 'edit' || activeTool === 'fog');
}

function computeFowAlpha(myRole: Role, fogGmAlpha: number, theme: string): number {
  return myRole === 'GM' ? fogGmAlpha : (theme === 'dark' ? 0.5 : 0.7);
}

export default function GameCanvas({
  scene,
  myRole,
  myUserId,
  mode = 'play',
}: GameCanvasProps): JSX.Element {
  // The signed background URL lives on the DTO itself (projections.ts).
  const backgroundUrl = scene.backgroundUrl ?? undefined;
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [textAnnCoords, setTextAnnCoords] = useState<{ x: number; y: number } | null>(null);
  const [editTokenId, setEditTokenId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ tokenId: string; x: number; y: number } | null>(null);
  const [objCtxMenu, setObjCtxMenu] = useState<{ objectId: string; x: number; y: number } | null>(null);
  const [fogMarquee, setFogMarquee] = useState<FogMarquee | null>(null);

  const theme = useTheme();
  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);
  const viewportZoom = useAppSelector((s) => s.canvasViewport.zoom);
  const fogMode = useAppSelector((s) => s.canvasViewport.fogMode);
  const fogGmAlpha = useAppSelector((s) => s.canvasViewport.fogGmAlpha);

  const { onStageMouseDown, onStageMouseMove, onStageMouseUp, onStageClick } =
    useToolHandlers(activeTool, scene, myRole, myUserId, roomId, setTextAnnCoords, fogMode, setFogMarquee);

  const stageBg = theme === 'dark' ? '#0f172a' : '#fafafa';
  const fowAlpha = computeFowAlpha(myRole, fogGmAlpha, theme);
  const sceneWidth = scene.gridSize * scene.gridWidth;
  const sceneHeight = scene.gridSize * scene.gridHeight;
  const fogEditMode = fogEditActive(myRole, mode, activeTool);
  const cursor = getCursorStyle(activeTool, myRole);
  const isDraggable = isCanvasDraggable(activeTool);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = (): void => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: viewportZoom, y: viewportZoom });
    stage.batchDraw();
  }, [viewportZoom]);

  useEffect(() => {
    if (myRole !== 'GM') return;
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return;
      const ids = store.getState().scene.selectedSceneObjectIds;
      if (ids.length === 0) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        for (const id of ids) {
          emitObjectDelete({ roomId, sceneId: scene.id, objectId: id });
        }
        dispatch(deselectSceneObject());
        return;
      }

      if ((e.key === 'd' || e.key === 'D') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const state = store.getState();
        const inEditScene = state.room.editingSceneId !== null;
        const objects = state.scene.current?.annotations.objects ?? [];
        for (const id of ids) {
          if (inEditScene) {
            // Edit Scene: optimistic local clone only — flushed to server on Done.
            // No emit, so players don't see it until the scene is saved.
            const source = objects.find((o) => o.id === id);
            if (source) {
              const userId = state.session.currentUser?.id ?? '';
              const clone = buildClonedObject(source, objects, userId);
              dispatch(appendSceneObject(clone));
            }
          } else {
            // Play mode: emit to server. Server creates the canonical copy and
            // broadcasts object:duplicated → appendSceneObject on all clients.
            // No local optimistic here to avoid double-creation.
            emitObjectDuplicate({ roomId, sceneId: scene.id, objectId: id });
          }
        }
        // Selection intentionally not changed (future: select new ids).
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [roomId, scene.id, myRole, dispatch]);

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.target === e.target.getStage()) {
      dispatch(deselectSceneObject());
    }
    onStageClick(e);
  }

  function handleWheel(e: Konva.KonvaEventObject<WheelEvent>): void {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    if (!stage) return;
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const direction = e.evt.deltaY > 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    const newScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, oldScale * direction));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };
    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  return (
    <div ref={containerRef} className={styles.gameCanvas} style={{ cursor }}>
      <div className={styles.toolbar}>
        <AddTokenButton myRole={myRole} sceneId={scene.id} />
      </div>
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        draggable={isDraggable}
        onWheel={handleWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onClick={handleStageClick}
        style={{ background: stageBg }}
      >
        <BackgroundLayer
          {...(backgroundUrl !== undefined ? { backgroundUrl } : {})}
          gridSize={scene.gridSize}
          gridWidth={scene.gridWidth}
          gridHeight={scene.gridHeight}
          gridVisible={scene.gridVisible}
          fit={scene.backgroundFit}
          offsetX={scene.backgroundOffsetX}
          offsetY={scene.backgroundOffsetY}
          scale={scene.backgroundScale}
        />
        <AnnotationLayer
          layerFilter="tile"
          renderTransientHelpers={false}
          gridSize={scene.gridSize}
          roomId={roomId}
          sceneId={scene.id}
          myRole={myRole}
          onObjectContextMenu={(id, x, y) => { setObjCtxMenu({ objectId: id, x, y }); }}
        />
        <TokenLayer
          sceneId={scene.id}
          tokens={scene.tokens}
          gridSize={scene.gridSize}
          myRole={myRole}
          myUserId={myUserId}
          onTokenSelect={
            mode === 'edit'
              ? (id: string) => { dispatch(selectToken(id)); }
              : myRole === 'GM'
                ? (id: string) => setEditTokenId(id)
                : undefined
          }
          onTokenContextMenu={
            myRole === 'GM' && mode !== 'edit'
              ? (id, x, y) => setCtxMenu({ tokenId: id, x, y })
              : undefined
          }
        />
        <AnnotationLayer
          layerFilter="overlay"
          renderTransientHelpers={true}
          gridSize={scene.gridSize}
          roomId={roomId}
          sceneId={scene.id}
          myRole={myRole}
          onObjectContextMenu={(id, x, y) => { setObjCtxMenu({ objectId: id, x, y }); }}
        />
        <FogOfWarLayer
          fogShapes={scene.fogShapes ?? []}
          sceneWidth={sceneWidth}
          sceneHeight={sceneHeight}
          myRole={myRole}
          fowAlpha={fowAlpha}
        />
        {activeTool === 'fog' && myRole === 'GM' && (
          <FogMarqueeLayer marquee={fogMarquee} mode={fogMode} />
        )}
      </Stage>
      {fogEditMode && (
        <div className={styles.fogEditBadge} aria-live="polite">
          Fog edit mode
        </div>
      )}
      {textAnnCoords && (
        <TextAnnotationModal
          sceneId={scene.id}
          x={textAnnCoords.x}
          y={textAnnCoords.y}
          onClose={() => setTextAnnCoords(null)}
        />
      )}
      {editTokenId && (
        <TokenEditModal tokenId={editTokenId} onClose={() => setEditTokenId(null)} />
      )}
      {ctxMenu && (
        <TokenContextMenu
          tokenId={ctxMenu.tokenId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => { setEditTokenId(ctxMenu.tokenId); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {objCtxMenu && (
        <SceneObjectContextMenu
          objectId={objCtxMenu.objectId}
          x={objCtxMenu.x}
          y={objCtxMenu.y}
          onClose={() => setObjCtxMenu(null)}
        />
      )}
    </div>
  );
}
