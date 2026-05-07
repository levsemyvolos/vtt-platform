import { useRef } from 'react';
import type Konva from 'konva';
import type { Role, SceneDTO, FogShape } from '@vtt/shared';
import type { CanvasTool, FogMode } from '../store/canvasViewport';
import { useAppDispatch, useAppSelector } from '../store';
import { applyDrawStroke, fogShapeAdded, removeSceneObject, selectSceneObject, deselectSceneObject } from '../store/scene';
import { emitAnnotationPing, emitMeasure, emitDrawStroke, emitFogShapeAdd, emitObjectDelete } from '../api/socket';
import { recordUndo } from '../store/undoDispatcher';
import { store } from '../store';
import { getUserPingColor } from '../components/GameCanvas/layers/AnnotationLayer';
import { computeSelectionBox } from '../components/GameCanvas/selectionBox';
import { randomUUID } from '../utils/uuid';
import { resolveImageDimensions } from '../components/GameCanvas/imageDimensions';
import { apiAddImageAnnotation } from '../api/scenes';
import { setActiveTool, setPendingImageAssetId } from '../store/canvasViewport';
import type { FogMarquee } from '../components/GameCanvas/layers/FogMarqueeLayer';

const RULER_THROTTLE_MS = 67;
const DRAW_MIN_DIST = 4;
const FOG_MIN_SIZE_PX = 2;

function sceneCoords(stage: Konva.Stage): { x: number; y: number } | null {
  const scale = stage.scaleX();
  const pos = stage.position();
  const pointer = stage.getPointerPosition();
  if (!pointer) return null;
  return { x: (pointer.x - pos.x) / scale, y: (pointer.y - pos.y) / scale };
}

/** Sess 10.6 — rubber-band selection marquee in scene coords. Caller renders
 *  the rect; this hook owns the gesture state. */
export interface SelectMarquee {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function useToolHandlers(
  activeTool: CanvasTool,
  scene: SceneDTO,
  myRole: Role,
  myUserId: string,
  roomId: string,
  setTextAnnCoords: (coords: { x: number; y: number } | null) => void,
  fogMode: FogMode,
  setFogMarquee: (m: FogMarquee | null) => void,
  setSelectMarquee: (m: SelectMarquee | null) => void,
) {
  const dispatch = useAppDispatch();
  const brushSize = useAppSelector((s) => s.canvasViewport.brushSize);
  const strokeColorOverride = useAppSelector((s) => s.canvasViewport.strokeColor);

  const rulerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastRulerEmitRef = useRef<number>(0);
  const drawStrokeIdRef = useRef<string | null>(null);
  const drawPointsRef = useRef<number[]>([]);
  const lastDrawPtRef = useRef<{ x: number; y: number } | null>(null);
  const fogStartRef = useRef<{ x: number; y: number } | null>(null);
  // Sess 9.1 — Eraser tool: true while LMB is held, set of ids already erased
  // in the current gesture (avoids double-emit when the cursor wobbles).
  const eraserActiveRef = useRef<boolean>(false);
  const erasedIdsRef = useRef<Set<string>>(new Set());
  // Sess 10.6 — rubber-band marquee selection (select tool, GM only).
  const selectMarqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  // Latest pointer position during the marquee gesture — read at mouseUp to
  // compute final marquee bounds without depending on the rendered state.
  const selectMarqueeEndRef = useRef<{ x: number; y: number } | null>(null);

  function handleRulerMove(stage: Konva.Stage): void {
    if (!rulerStartRef.current || !roomId) return;
    const now = Date.now();
    if (now - lastRulerEmitRef.current < RULER_THROTTLE_MS) return;
    const coords = sceneCoords(stage);
    if (!coords) return;
    lastRulerEmitRef.current = now;
    emitMeasure({ roomId, sceneId: scene.id, from: rulerStartRef.current, to: coords, userId: myUserId });
  }

  function handleDrawMove(stage: Konva.Stage): void {
    if (myRole !== 'GM' || !drawStrokeIdRef.current) return;
    const coords = sceneCoords(stage);
    if (!coords) return;
    const last = lastDrawPtRef.current;
    if (last) {
      const dx = coords.x - last.x;
      const dy = coords.y - last.y;
      if (Math.sqrt(dx * dx + dy * dy) < DRAW_MIN_DIST) return;
    }
    drawPointsRef.current.push(coords.x, coords.y);
    lastDrawPtRef.current = coords;
    const strokeId = drawStrokeIdRef.current;
    // Sess 9.2 — explicit picker color overrides the per-user auto color.
    const color = strokeColorOverride || getUserPingColor(myUserId);
    dispatch(applyDrawStroke({
      roomId, sceneId: scene.id, strokeId, userId: myUserId,
      points: [...drawPointsRef.current], color, width: brushSize,
    }));
  }

  function handleFogDragMove(stage: Konva.Stage): void {
    if (!fogStartRef.current) return;
    const coords = sceneCoords(stage);
    if (!coords) return;
    setFogMarquee({
      x0: fogStartRef.current.x,
      y0: fogStartRef.current.y,
      x1: coords.x,
      y1: coords.y,
    });
  }

  function commitFogShape(stage: Konva.Stage): void {
    if (myRole !== 'GM' || !roomId || !fogStartRef.current) {
      fogStartRef.current = null;
      setFogMarquee(null);
      return;
    }
    const coords = sceneCoords(stage);
    if (!coords) {
      fogStartRef.current = null;
      setFogMarquee(null);
      return;
    }
    const x0 = Math.min(fogStartRef.current.x, coords.x);
    const y0 = Math.min(fogStartRef.current.y, coords.y);
    const x1 = Math.max(fogStartRef.current.x, coords.x);
    const y1 = Math.max(fogStartRef.current.y, coords.y);
    fogStartRef.current = null;
    setFogMarquee(null);
    const w = x1 - x0;
    const h = y1 - y0;
    if (w < FOG_MIN_SIZE_PX || h < FOG_MIN_SIZE_PX) return;

    const sceneW = scene.gridSize * scene.gridWidth;
    const sceneH = scene.gridSize * scene.gridHeight;
    const cx = Math.max(0, Math.min(sceneW, x0));
    const cy = Math.max(0, Math.min(sceneH, y0));
    const cw = Math.max(0, Math.min(sceneW - cx, w));
    const ch = Math.max(0, Math.min(sceneH - cy, h));
    if (cw < FOG_MIN_SIZE_PX || ch < FOG_MIN_SIZE_PX) return;

    const shape: FogShape = {
      id: randomUUID(),
      x: cx,
      y: cy,
      w: cw,
      h: ch,
      mode: fogMode,
      createdAt: Date.now(),
    };
    const payload = { roomId, sceneId: scene.id, shape };
    dispatch(fogShapeAdded(payload));
    emitFogShapeAdd(payload);
    recordUndo({ kind: 'fog_add', shape });
  }

  /** Sess 9.1 — Walk up Konva node parents to find the first ancestor with an id. */
  function findIdAncestor(node: Konva.Node | null): string | undefined {
    let n: Konva.Node | null = node;
    while (n) {
      const id = n.id();
      if (id) return id;
      n = n.getParent();
    }
    return undefined;
  }

  /** Erase the topmost stroke at the current pointer position. Uses
   *  getAllIntersections so the eraser "passes through" tokens/images and
   *  hits strokes below them. No-ops on already-erased ids in this gesture. */
  function tryEraseAtPointer(stage: Konva.Stage): void {
    if (myRole !== 'GM' || !roomId) return;
    const ptr = stage.getPointerPosition();
    if (!ptr) return;
    // Iterate hits front-to-back; pick the first stroke-typed SceneObject.
    const hits = stage.getAllIntersections(ptr) as Konva.Node[];
    const objects = store.getState().scene.current?.annotations.objects ?? [];
    for (const hit of hits) {
      const id = findIdAncestor(hit);
      if (!id || erasedIdsRef.current.has(id)) continue;
      const obj = objects.find((o) => o.id === id);
      if (!obj || obj.type !== 'stroke') continue;
      erasedIdsRef.current.add(id);
      const snapshot = JSON.parse(JSON.stringify(obj)) as typeof obj;
      dispatch(removeSceneObject(id));
      emitObjectDelete({ roomId, sceneId: scene.id, objectId: id });
      recordUndo({ kind: 'object_delete', object: snapshot });
      return;
    }
  }

  function startDrawGesture(coords: { x: number; y: number }): void {
    drawStrokeIdRef.current = randomUUID();
    drawPointsRef.current = [coords.x, coords.y];
    lastDrawPtRef.current = coords;
  }

  function startEraserGesture(stage: Konva.Stage): void {
    eraserActiveRef.current = true;
    erasedIdsRef.current = new Set();
    tryEraseAtPointer(stage);
  }

  function startFogGesture(coords: { x: number; y: number }): void {
    fogStartRef.current = coords;
    setFogMarquee({ x0: coords.x, y0: coords.y, x1: coords.x, y1: coords.y });
  }

  function startSelectMarquee(coords: { x: number; y: number }): void {
    selectMarqueeStartRef.current = coords;
    selectMarqueeEndRef.current = null;
    setSelectMarquee({ x0: coords.x, y0: coords.y, x1: coords.x, y1: coords.y });
  }

  /** Sess 10.7 — only starts a marquee when the click landed on the empty
   *  stage (not on an object). The button-filter (LMB only) is enforced
   *  upstream in onStageMouseDown. Extracted to keep that switch readable. */
  function maybeStartSelectMarquee(
    e: Konva.KonvaEventObject<MouseEvent>,
    coords: { x: number; y: number },
  ): void {
    const stage = e.target.getStage();
    if (!stage || e.target !== stage) return;
    startSelectMarquee(coords);
  }

  function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    // Sess 10.7.1 — only LMB starts tool gestures. Middle-mouse is reserved for
    // canvas pan (suppressed in capture phase by GameCanvas); RMB is reserved
    // for context menus. Without this guard, holding middle/right while a tool
    // (draw/fog/eraser) was active would also fire that tool's gesture.
    if (e.evt.button !== 0) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const coords = sceneCoords(stage);
    if (!coords) return;
    if (activeTool === 'ruler') { rulerStartRef.current = coords; return; }
    if (myRole !== 'GM') return;
    switch (activeTool) {
      case 'draw': startDrawGesture(coords); break;
      case 'eraser': startEraserGesture(stage); break;
      case 'fog': startFogGesture(coords); break;
      case 'select': maybeStartSelectMarquee(e, coords); break;
    }
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = e.target.getStage();
    if (!stage) return;
    if (activeTool === 'ruler') handleRulerMove(stage);
    else if (activeTool === 'draw') handleDrawMove(stage);
    else if (activeTool === 'eraser' && eraserActiveRef.current) tryEraseAtPointer(stage);
    else if (activeTool === 'fog') handleFogDragMove(stage);
    else if (activeTool === 'select' && selectMarqueeStartRef.current) {
      const coords = sceneCoords(stage);
      if (!coords) return;
      const start = selectMarqueeStartRef.current;
      selectMarqueeEndRef.current = coords;
      setSelectMarquee({ x0: start.x, y0: start.y, x1: coords.x, y1: coords.y });
    }
  }

  function commitDrawStroke(): void {
    if (myRole !== 'GM' || !drawStrokeIdRef.current || !roomId) return;
    const strokeId = drawStrokeIdRef.current;
    const points = [...drawPointsRef.current];
    if (points.length >= 4) {
      const stroke = {
        roomId, sceneId: scene.id, strokeId, userId: myUserId,
        points, color: strokeColorOverride || getUserPingColor(myUserId), width: brushSize,
      };
      emitDrawStroke(stroke);
      const objects = store.getState().scene.current?.annotations.objects ?? [];
      const obj = objects.find((o) => o.id === strokeId);
      if (obj) recordUndo({ kind: 'draw_stroke', stroke, object: obj });
    }
    drawStrokeIdRef.current = null;
    drawPointsRef.current = [];
    lastDrawPtRef.current = null;
  }

  /** Collects ids of all unlocked SceneObjects whose AABB intersects the marquee.
   *  Ignores rotation (good-enough approximation for selection feedback). */
  function findObjectsInMarquee(x0: number, y0: number, x1: number, y1: number): string[] {
    const objects = store.getState().scene.current?.annotations.objects ?? [];
    const hits: string[] = [];
    for (const obj of objects) {
      if (obj.locked === true) continue;
      const box = computeSelectionBox(obj);
      const ox0 = obj.x + box.x;
      const oy0 = obj.y + box.y;
      const ox1 = ox0 + box.w;
      const oy1 = oy0 + box.h;
      if (ox1 < x0 || ox0 > x1 || oy1 < y0 || oy0 > y1) continue;
      hits.push(obj.id);
    }
    return hits;
  }

  /** Sess 10.6 — commit rubber-band selection: pick all SceneObjects whose
   *  bounding box intersects the marquee, swap into Redux selection. */
  function commitSelectMarquee(): void {
    const start = selectMarqueeStartRef.current;
    const end = selectMarqueeEndRef.current;
    selectMarqueeStartRef.current = null;
    selectMarqueeEndRef.current = null;
    setSelectMarquee(null);
    if (!start) return;
    if (!end || (Math.abs(end.x - start.x) < 4 && Math.abs(end.y - start.y) < 4)) {
      // No drag / tiny marquee → treat as click on empty area → clear selection.
      dispatch(deselectSceneObject());
      return;
    }
    const x0 = Math.min(start.x, end.x);
    const y0 = Math.min(start.y, end.y);
    const x1 = Math.max(start.x, end.x);
    const y1 = Math.max(start.y, end.y);
    const hits = findObjectsInMarquee(x0, y0, x1, y1);
    if (hits.length === 0) {
      dispatch(deselectSceneObject());
      return;
    }
    // First hit replaces selection; subsequent ones add additively.
    dispatch(selectSceneObject({ id: hits[0]! }));
    for (let i = 1; i < hits.length; i++) {
      dispatch(selectSceneObject({ id: hits[i]!, additive: true }));
    }
  }

  function onStageMouseUp(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (activeTool === 'ruler') {
      rulerStartRef.current = null;
    } else if (activeTool === 'draw') {
      commitDrawStroke();
    } else if (activeTool === 'eraser') {
      eraserActiveRef.current = false;
      erasedIdsRef.current = new Set();
    } else if (activeTool === 'select' && selectMarqueeStartRef.current) {
      commitSelectMarquee();
    } else if (activeTool === 'fog') {
      const stage = e.target.getStage();
      if (stage) commitFogShape(stage);
      else {
        fogStartRef.current = null;
        setFogMarquee(null);
      }
    }
  }

  function onStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.target !== e.target.getStage()) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const coords = sceneCoords(stage);
    if (!coords) return;
    if (activeTool === 'ping' && roomId) {
      emitAnnotationPing({
        roomId, sceneId: scene.id, ...coords,
        color: getUserPingColor(myUserId), userId: myUserId, timestamp: Date.now(),
      });
    } else if (activeTool === 'text' && myRole === 'GM') {
      setTextAnnCoords(coords);
    } else if (activeTool === 'image' && myRole === 'GM') {
      void placeImageAtCoords(coords);
    }
  }

  /** Sess 8 — places the pending image asset at the clicked scene coords with
   *  natural aspect ratio. No-op if no asset is pending (which means the user
   *  clicked the canvas before picking from the modal). On success: records undo,
   *  clears pending, and reverts to the select tool. */
  async function placeImageAtCoords(coords: { x: number; y: number }): Promise<void> {
    const state = store.getState();
    const pendingAssetId = state.canvasViewport.pendingImageAssetId;
    if (!pendingAssetId) return;
    const asset = state.assets.byId[pendingAssetId];
    if (!asset) return;
    const beforeIds = new Set((state.scene.current?.annotations.objects ?? []).map((o) => o.id));
    const { w, h } = await resolveImageDimensions(asset.url, scene.gridSize);
    // Center the image on the click point (more intuitive than top-left anchor).
    const x = Math.round(coords.x - w / 2);
    const y = Math.round(coords.y - h / 2);
    try {
      const result = await apiAddImageAnnotation(scene.id, { x, y, assetId: pendingAssetId, width: w, height: h });
      const newObj = (result.objects ?? []).find((o) => !beforeIds.has(o.id) && o.type === 'image');
      if (newObj) recordUndo({ kind: 'object_add', object: newObj });
    } finally {
      dispatch(setPendingImageAssetId(null));
      dispatch(setActiveTool('select'));
    }
  }

  return { onStageMouseDown, onStageMouseMove, onStageMouseUp, onStageClick };
}
