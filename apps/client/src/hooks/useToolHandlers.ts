import { useRef } from 'react';
import type Konva from 'konva';
import type { Role, SceneDTO, FogShape } from '@vtt/shared';
import type { CanvasTool, FogMode } from '../store/canvasViewport';
import { useAppDispatch, useAppSelector } from '../store';
import { applyDrawStroke, fogShapeAdded } from '../store/scene';
import { emitAnnotationPing, emitMeasure, emitDrawStroke, emitFogShapeAdd } from '../api/socket';
import { recordUndo } from '../store/undoDispatcher';
import { store } from '../store';
import { getUserPingColor } from '../components/GameCanvas/layers/AnnotationLayer';
import { randomUUID } from '../utils/uuid';
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

export function useToolHandlers(
  activeTool: CanvasTool,
  scene: SceneDTO,
  myRole: Role,
  myUserId: string,
  roomId: string,
  setTextAnnCoords: (coords: { x: number; y: number } | null) => void,
  fogMode: FogMode,
  setFogMarquee: (m: FogMarquee | null) => void,
) {
  const dispatch = useAppDispatch();
  const brushSize = useAppSelector((s) => s.canvasViewport.brushSize);

  const rulerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastRulerEmitRef = useRef<number>(0);
  const drawStrokeIdRef = useRef<string | null>(null);
  const drawPointsRef = useRef<number[]>([]);
  const lastDrawPtRef = useRef<{ x: number; y: number } | null>(null);
  const fogStartRef = useRef<{ x: number; y: number } | null>(null);

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
    const color = getUserPingColor(myUserId);
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

  function onStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = e.target.getStage();
    if (!stage) return;
    const coords = sceneCoords(stage);
    if (!coords) return;
    if (activeTool === 'ruler') {
      rulerStartRef.current = coords;
    } else if (activeTool === 'draw' && myRole === 'GM') {
      drawStrokeIdRef.current = randomUUID();
      drawPointsRef.current = [coords.x, coords.y];
      lastDrawPtRef.current = coords;
    } else if (activeTool === 'fog' && myRole === 'GM') {
      fogStartRef.current = coords;
      setFogMarquee({ x0: coords.x, y0: coords.y, x1: coords.x, y1: coords.y });
    }
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = e.target.getStage();
    if (!stage) return;
    if (activeTool === 'ruler') handleRulerMove(stage);
    else if (activeTool === 'draw') handleDrawMove(stage);
    else if (activeTool === 'fog') handleFogDragMove(stage);
  }

  function commitDrawStroke(): void {
    if (myRole !== 'GM' || !drawStrokeIdRef.current || !roomId) return;
    const strokeId = drawStrokeIdRef.current;
    const points = [...drawPointsRef.current];
    if (points.length >= 4) {
      const stroke = {
        roomId, sceneId: scene.id, strokeId, userId: myUserId,
        points, color: getUserPingColor(myUserId), width: brushSize,
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

  function onStageMouseUp(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (activeTool === 'ruler') {
      rulerStartRef.current = null;
    } else if (activeTool === 'draw') {
      commitDrawStroke();
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
    }
  }

  return { onStageMouseDown, onStageMouseMove, onStageMouseUp, onStageClick };
}
