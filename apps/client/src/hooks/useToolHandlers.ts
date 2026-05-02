import { useRef } from 'react';
import type Konva from 'konva';
import type { Role, SceneDTO } from '@vtt/shared';
import type { CanvasTool } from '../store/canvasViewport';
import { useAppDispatch } from '../store';
import { applyDrawStroke } from '../store/scene';
import { emitAnnotationPing, emitMeasure, emitDrawStroke } from '../api/socket';
import { getUserPingColor } from '../components/GameCanvas/layers/AnnotationLayer';
import { randomUUID } from '../utils/uuid';

const RULER_THROTTLE_MS = 67;
const DRAW_MIN_DIST = 4;

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
) {
  const dispatch = useAppDispatch();

  const rulerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastRulerEmitRef = useRef<number>(0);
  const drawStrokeIdRef = useRef<string | null>(null);
  const drawPointsRef = useRef<number[]>([]);
  const lastDrawPtRef = useRef<{ x: number; y: number } | null>(null);

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
      points: [...drawPointsRef.current], color, width: 3,
    }));
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
    }
  }

  function onStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = e.target.getStage();
    if (!stage) return;
    if (activeTool === 'ruler') handleRulerMove(stage);
    else if (activeTool === 'draw') handleDrawMove(stage);
  }

  function onStageMouseUp(): void {
    if (activeTool === 'ruler') {
      rulerStartRef.current = null;
    } else if (activeTool === 'draw' && myRole === 'GM' && drawStrokeIdRef.current && roomId) {
      const strokeId = drawStrokeIdRef.current;
      const points = [...drawPointsRef.current];
      if (points.length >= 4) {
        emitDrawStroke({
          roomId, sceneId: scene.id, strokeId, userId: myUserId,
          points, color: getUserPingColor(myUserId), width: 3,
        });
      }
      drawStrokeIdRef.current = null;
      drawPointsRef.current = [];
      lastDrawPtRef.current = null;
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
