import { useEffect, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { store } from '../../store';
import { selectToken, deselectSceneObject, appendSceneObject } from '../../store/scene';
import { performUndo, performRedo, recordUndo } from '../../store/undoDispatcher';
import { requestAddFromToken } from '../../store/initiativeUi';
import { emitObjectDelete, emitObjectDuplicate } from '../../api/socket';
import { buildClonedObject } from '../../store/sceneObjectClone';
import type { CanvasTool } from '../../store/canvasViewport';
import { setActiveTool, setPendingImageAssetId } from '../../store/canvasViewport';
import { useTheme } from '../../hooks/useTheme';
import { useToolHandlers, type SelectMarquee } from '../../hooks/useToolHandlers';
import BackgroundLayer from './layers/BackgroundLayer';
import TokenLayer from './layers/TokenLayer';
import AnnotationLayer from './layers/AnnotationLayer';
import FogOfWarLayer from './layers/FogOfWarLayer';
import FogMarqueeLayer, { type FogMarquee } from './layers/FogMarqueeLayer';
import SelectMarqueeLayer from './layers/SelectMarqueeLayer';
import ImagePlacementGhost from './layers/ImagePlacementGhost';
import { useImageToolState } from './useImageToolState';
import { useCanvasFileDrop } from './useCanvasFileDrop';
import { useFogCompactWorker } from '../../hooks/useFogCompactWorker';
import TextAnnotationModal from './TextAnnotationModal';
import ImageAnnotationPickerModal from './ImageAnnotationPickerModal';
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
const GM_TOOL_CURSORS: Partial<Record<CanvasTool, string>> = {
  text: 'text', image: 'crosshair', fog: 'cell', eraser: 'crosshair',
};

/** Sess 10.7.1 — Pan tool always shows the grab cursor for both GM and Player.
 *  Lifted out of getCursorStyle so GM_TOOL_CURSORS keeps its GM-only semantics. */
const PAN_CURSOR = 'grab';

/** Sess 8.6 — visual highlight class while dragging a file over the canvas.
 *  Lifted to module scope so the ternary doesn't count against GameCanvas. */
function getContainerClass(isDraggingFile: boolean): string {
  const base = styles.gameCanvas ?? '';
  if (isDraggingFile) return `${base} ${styles.gameCanvasDropping ?? ''}`;
  return base;
}

/** Sess 10.6 — derived render flags so each conditional Layer is a single
 *  pre-computed boolean in JSX, keeping GameCanvas under complexity gate. */
function computeRenderFlags(
  activeTool: CanvasTool,
  myRole: Role,
  showPlacementGhost: boolean,
  pendingImageAssetUrl: string | undefined,
): { fogMarquee: boolean; selectMarquee: boolean; imageGhost: boolean } {
  const isGM = myRole === 'GM';
  return {
    fogMarquee: activeTool === 'fog' && isGM,
    selectMarquee: activeTool === 'select' && isGM,
    imageGhost: showPlacementGhost && Boolean(pendingImageAssetUrl),
  };
}

function getCursorStyle(activeTool: CanvasTool, myRole: Role): string {
  if (activeTool === 'pan') return PAN_CURSOR;
  if (activeTool === 'ping' || activeTool === 'ruler' || activeTool === 'draw') return 'crosshair';
  if (myRole === 'GM') return GM_TOOL_CURSORS[activeTool] ?? 'default';
  return 'default';
}

/** Sess 10.7.1 — Stage is Konva-draggable ONLY when the explicit Pan tool is
 *  active. Previously we used a NON_DRAGGABLE_TOOLS denylist so 'select' was
 *  draggable too — but Konva's drag intercepts LMB-mousedown on the empty
 *  stage, which prevented the rubber-band marquee gesture (Sess 10.6) from
 *  ever starting. Middle-mouse pan still works via a container-level capture
 *  handler regardless of activeTool. */
function isCanvasDraggable(activeTool: CanvasTool): boolean {
  return activeTool === 'pan';
}

function fogEditActive(myRole: Role, mode: 'edit' | 'play', activeTool: string): boolean {
  return myRole === 'GM' && (mode === 'edit' || activeTool === 'fog');
}

function computeFowAlpha(myRole: Role, fogGmAlpha: number, theme: string): number {
  return myRole === 'GM' ? fogGmAlpha : (theme === 'dark' ? 0.5 : 0.7);
}

/** True if the keyboard target is a focusable input/textarea/contenteditable;
 *  used to suppress canvas shortcuts. Extracted to keep handleKeyDown ≤ 10. */
function isInputTarget(target: HTMLElement): boolean {
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}

/** Resolves the token-select callback for TokenLayer based on mode + role.
 *  Extracted to keep GameCanvas cyclomatic complexity ≤ 10 (lint gate). */
function resolveTokenSelect(
  mode: 'edit' | 'play',
  myRole: Role,
  selectTokenForEdit: (id: string) => void,
  setEditTokenId: (id: string) => void,
): ((id: string) => void) | undefined {
  if (mode === 'edit') return selectTokenForEdit;
  if (myRole === 'GM') return setEditTokenId;
  return undefined;
}

/** Resolves the token-context-menu callback (GM-only in play mode). */
function resolveTokenContextMenu(
  mode: 'edit' | 'play',
  myRole: Role,
  open: (id: string, x: number, y: number) => void,
): ((id: string, x: number, y: number) => void) | undefined {
  if (myRole === 'GM' && mode !== 'edit') return open;
  return undefined;
}

interface CanvasOverlaysProps {
  scene: SceneDTO;
  fogEditMode: boolean;
  textAnnCoords: { x: number; y: number } | null;
  editTokenId: string | null;
  ctxMenu: { tokenId: string; x: number; y: number } | null;
  objCtxMenu: { objectId: string; x: number; y: number } | null;
  onCloseTextAnn: () => void;
  onCloseEditToken: () => void;
  onEditTokenFromCtx: (tokenId: string) => void;
  onCloseCtxMenu: () => void;
  onAddToInitiative: (tokenId: string) => void;
  onCloseObjCtx: () => void;
}

/** Renders DOM-level modal/overlay UI that lives outside the Konva stage.
 *  Extracted from GameCanvas to keep cyclomatic complexity ≤ 10 (lint gate). */
function CanvasOverlays(props: CanvasOverlaysProps): JSX.Element {
  const { scene, fogEditMode, textAnnCoords, editTokenId, ctxMenu, objCtxMenu,
    onCloseTextAnn, onCloseEditToken, onEditTokenFromCtx, onCloseCtxMenu, onAddToInitiative, onCloseObjCtx } = props;
  return (
    <>
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
          onClose={onCloseTextAnn}
        />
      )}
      {editTokenId && (
        <TokenEditModal tokenId={editTokenId} onClose={onCloseEditToken} />
      )}
      {ctxMenu && (
        <TokenContextMenu
          tokenId={ctxMenu.tokenId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => onEditTokenFromCtx(ctxMenu.tokenId)}
          onClose={onCloseCtxMenu}
          onAddToInitiative={() => onAddToInitiative(ctxMenu.tokenId)}
        />
      )}
      {objCtxMenu && (
        <SceneObjectContextMenu
          objectId={objCtxMenu.objectId}
          x={objCtxMenu.x}
          y={objCtxMenu.y}
          onClose={onCloseObjCtx}
        />
      )}
    </>
  );
}

/** Emits delete for every currently-selected object id. Sess 7.5 — snapshots
 *  each object BEFORE emit so the global undo stack can restore them via
 *  object:upsert on Ctrl+Z. */
function deleteSelectedObjects(ids: string[], roomId: string, sceneId: string): void {
  const objects = store.getState().scene.current?.annotations.objects ?? [];
  const snapshots = ids
    .map((id) => objects.find((o) => o.id === id))
    .filter((o): o is import('@vtt/shared').SceneObject => Boolean(o))
    .map((o) => JSON.parse(JSON.stringify(o)) as import('@vtt/shared').SceneObject);
  for (const id of ids) {
    emitObjectDelete({ roomId, sceneId, objectId: id });
  }
  for (const snap of snapshots) {
    recordUndo({ kind: 'object_delete', object: snap });
  }
}

/** Duplicates each selected object — locally in Edit Scene, via emit otherwise. */
function duplicateSelectedObjects(
  ids: string[],
  roomId: string,
  sceneId: string,
  dispatch: ReturnType<typeof useAppDispatch>,
): void {
  const state = store.getState();
  const inEditScene = state.room.editingSceneId !== null;
  const objects = state.scene.current?.annotations.objects ?? [];
  for (const id of ids) {
    if (inEditScene) {
      // Edit Scene: optimistic local clone only — flushed to server on Done.
      const source = objects.find((o) => o.id === id);
      if (source) {
        const userId = state.session.currentUser?.id ?? '';
        const clone = buildClonedObject(source, objects, userId);
        dispatch(appendSceneObject(clone));
      }
    } else {
      // Play mode: emit to server; server broadcasts object:duplicated.
      emitObjectDuplicate({ roomId, sceneId, objectId: id });
    }
  }
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
  const [selectMarquee, setSelectMarquee] = useState<SelectMarquee | null>(null);

  const theme = useTheme();
  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);
  const viewportZoom = useAppSelector((s) => s.canvasViewport.zoom);
  const fogMode = useAppSelector((s) => s.canvasViewport.fogMode);
  const fogGmAlpha = useAppSelector((s) => s.canvasViewport.fogGmAlpha);
  // Sess 8 + 8.5 — image-tool UI state (modal, ghost preview).
  const imgTool = useImageToolState(myRole, activeTool);
  // Sess 8.6 — drop image files anywhere on canvas to upload + place.
  const fileDrop = useCanvasFileDrop({ scene, myRole, roomId, containerRef, stageRef });
  // Sess 11 — auto-compaction of fog shapes once the per-scene count crosses
  // FOG_COMPACTION_THRESHOLD. GM-only no-op for players.
  useFogCompactWorker({ scene, myRole, roomId });
  // Sess 10.6 — derived flags lifted into a single object so the JSX consumes
  // pre-computed booleans (zero-branch in render). Keeps GameCanvas under the
  // cyclomatic-complexity gate.
  const renderFlags = computeRenderFlags(activeTool, myRole, imgTool.showPlacementGhost, imgTool.pendingImageAssetUrl);

  const { onStageMouseDown, onStageMouseMove, onStageMouseUp, onStageClick } =
    useToolHandlers(activeTool, scene, myRole, myUserId, roomId, setTextAnnCoords, fogMode, setFogMarquee, setSelectMarquee);

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
      // Clamp to ≥ 1 px — otherwise Konva tries to drawImage onto a 0×0 cached
      // canvas during a tiny window state and throws InvalidStateError (Sess 7 fix).
      setSize({
        width: Math.max(1, el.clientWidth),
        height: Math.max(1, el.clientHeight),
      });
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

  // Sess 10.7.1 — middle-mouse-drag pan, independent of activeTool. The handler
  // attaches in CAPTURE phase and calls stopImmediatePropagation so Konva's
  // own mousedown listeners (which would otherwise (a) start a Konva drag if the
  // Pan tool is active and (b) trigger the active tool's gesture via
  // onStageMouseDown) never see the middle-button event. Industry-standard
  // shortcut alongside the explicit Pan tool (Figma, Miro, Foundry VTT).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let panStart: { sx: number; sy: number; stageX: number; stageY: number } | null = null;
    function onMouseDown(e: MouseEvent): void {
      if (e.button !== 1) return;
      const stage = stageRef.current;
      if (!stage) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      panStart = { sx: e.clientX, sy: e.clientY, stageX: stage.x(), stageY: stage.y() };
    }
    function onMouseMove(e: MouseEvent): void {
      if (!panStart) return;
      const stage = stageRef.current;
      if (!stage) return;
      stage.position({
        x: panStart.stageX + (e.clientX - panStart.sx),
        y: panStart.stageY + (e.clientY - panStart.sy),
      });
      stage.batchDraw();
    }
    function onMouseUp(e: MouseEvent): void {
      if (e.button !== 1) return;
      panStart = null;
    }
    // Suppress the Windows middle-click auto-scroll cursor.
    function onAuxClick(e: MouseEvent): void {
      if (e.button === 1) e.preventDefault();
    }
    el.addEventListener('mousedown', onMouseDown, { capture: true });
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    el.addEventListener('auxclick', onAuxClick);
    return () => {
      el.removeEventListener('mousedown', onMouseDown, { capture: true });
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('auxclick', onAuxClick);
    };
  }, []);

  useEffect(() => {
    if (myRole !== 'GM') return;
    function tryHandleUndoRedo(e: KeyboardEvent): boolean {
      if (!(e.ctrlKey || e.metaKey)) return false;
      // Sess 8.5 — use e.code (physical key position) instead of e.key so
      // Cyrillic / non-Latin layouts also fire Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z.
      // KeyZ = physical Z, KeyY = physical Y; they don't depend on the
      // active OS keyboard layout.
      if (e.code === 'KeyZ') { e.preventDefault(); if (e.shiftKey) performRedo(); else performUndo(); return true; }
      if (e.code === 'KeyY') { e.preventDefault(); performRedo(); return true; }
      return false;
    }
    function tryHandleEscapePending(e: KeyboardEvent): boolean {
      // Sess 8 — ESC during pending image placement cancels (returns to select).
      if (e.key !== 'Escape') return false;
      const state = store.getState();
      if (state.canvasViewport.activeTool === 'image' && state.canvasViewport.pendingImageAssetId) {
        e.preventDefault();
        dispatch(setPendingImageAssetId(null));
        dispatch(setActiveTool('select'));
        return true;
      }
      return false;
    }
    function trySelectionShortcut(e: KeyboardEvent, ids: string[]): void {
      if (ids.length === 0) return;
      // Delete/Backspace are named keys — layout-independent already.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelectedObjects(ids, roomId, scene.id);
        dispatch(deselectSceneObject());
        return;
      }
      // Sess 8.5 — Ctrl+D via physical key code so Cyrillic layout also fires.
      if (e.code === 'KeyD' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        duplicateSelectedObjects(ids, roomId, scene.id, dispatch);
      }
    }
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement;
      if (isInputTarget(target)) return;
      if (tryHandleUndoRedo(e)) return;
      if (tryHandleEscapePending(e)) return;
      const ids = store.getState().scene.selectedSceneObjectIds;
      trySelectionShortcut(e, ids);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [roomId, scene.id, myRole, dispatch]);

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    // Sess 10.6 — for select tool, marquee commit (in useToolHandlers) handles
    // both the "click on empty area = clear" and "drag = select range" cases,
    // so we don't issue a duplicate deselect here. For other tools (ping/text/
    // image etc.), keep the legacy behavior — click on empty stage clears.
    const isSelectTool = activeTool === 'select';
    if (!isSelectTool && e.target === e.target.getStage()) {
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
    <div
      ref={containerRef}
      className={getContainerClass(fileDrop.isDraggingFile)}
      style={{ cursor }}
      onDragOver={fileDrop.onDragOver}
      onDragLeave={fileDrop.onDragLeave}
      onDrop={fileDrop.onDrop}
    >
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
          roomId={roomId}
          tokens={scene.tokens}
          gridSize={scene.gridSize}
          myRole={myRole}
          myUserId={myUserId}
          onTokenSelect={resolveTokenSelect(
            mode,
            myRole,
            (id) => dispatch(selectToken(id)),
            (id) => setEditTokenId(id),
          )}
          onTokenContextMenu={resolveTokenContextMenu(
            mode,
            myRole,
            (id, x, y) => setCtxMenu({ tokenId: id, x, y }),
          )}
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
          fogBitmap={scene.fogBitmap ?? null}
          sceneWidth={sceneWidth}
          sceneHeight={sceneHeight}
          myRole={myRole}
          fowAlpha={fowAlpha}
        />
        {renderFlags.fogMarquee && <FogMarqueeLayer marquee={fogMarquee} mode={fogMode} />}
        {renderFlags.selectMarquee && <SelectMarqueeLayer marquee={selectMarquee} />}
        {renderFlags.imageGhost && (
          <ImagePlacementGhost
            stage={stageRef.current}
            assetUrl={imgTool.pendingImageAssetUrl!}
            gridSize={scene.gridSize}
          />
        )}
      </Stage>
      <CanvasOverlays
        scene={scene}
        fogEditMode={fogEditMode}
        textAnnCoords={textAnnCoords}
        editTokenId={editTokenId}
        ctxMenu={ctxMenu}
        objCtxMenu={objCtxMenu}
        onCloseTextAnn={() => setTextAnnCoords(null)}
        onCloseEditToken={() => setEditTokenId(null)}
        onEditTokenFromCtx={(tokenId) => { setEditTokenId(tokenId); setCtxMenu(null); }}
        onCloseCtxMenu={() => setCtxMenu(null)}
        onAddToInitiative={(tokenId) => {
          const token = scene.tokens.find((tk) => tk.id === tokenId);
          if (token) dispatch(requestAddFromToken({ tokenId: token.id, name: token.name }));
          setCtxMenu(null);
        }}
        onCloseObjCtx={() => setObjCtxMenu(null)}
      />
      {imgTool.showImagePicker && (
        <ImageAnnotationPickerModal
          roomId={roomId}
          onPick={(asset) => { dispatch(setPendingImageAssetId(asset.id)); }}
          onClose={() => { dispatch(setActiveTool('select')); }}
        />
      )}
    </div>
  );
}
