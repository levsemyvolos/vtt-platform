import { useEffect, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import { randomUUID } from '../../utils/uuid';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectToken, applyDrawStroke } from '../../store/scene';
import { useTheme } from '../../hooks/useTheme';
import BackgroundLayer from './layers/BackgroundLayer';
import TokenLayer from './layers/TokenLayer';
import AnnotationLayer from './layers/AnnotationLayer';
import FogOfWarLayer from './layers/FogOfWarLayer';
import AddTokenButton from './AddTokenButton';
import TextAnnotationModal from './TextAnnotationModal';
import { getUserPingColor } from './layers/AnnotationLayer';
import { emitAnnotationPing, emitMeasure, emitDrawStroke } from '../../api/socket';
import styles from './GameCanvas.module.css';

export interface GameCanvasProps {
  scene: SceneDTO;
  myRole: Role;
  myUserId: string;
  /** Optional URL for the scene background bitmap (Ф2.2.5). */
  backgroundUrl?: string;
  /** 'edit' enables fog-drag for GM and token-click-to-select. Default: 'play'. */
  mode?: 'edit' | 'play';
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.08;
/** Throttle ruler broadcast to ~15 fps. */
const RULER_THROTTLE_MS = 67;
/** Minimum distance between recorded draw points (px) to avoid redundant points. */
const DRAW_MIN_DIST = 4;

function fogEditActive(myRole: Role, mode: 'edit' | 'play', activeTool: string): boolean {
  return myRole === 'GM' && (mode === 'edit' || activeTool === 'fog');
}

export default function GameCanvas({
  scene,
  myRole,
  myUserId,
  backgroundUrl,
  mode = 'play',
}: GameCanvasProps): JSX.Element {
  const dispatch = useAppDispatch();
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage | null>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  // Ruler drag state
  const rulerStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastRulerEmitRef = useRef<number>(0);

  // Draw stroke state
  const drawStrokeIdRef = useRef<string | null>(null);
  const drawPointsRef = useRef<number[]>([]);
  const lastDrawPtRef = useRef<{ x: number; y: number } | null>(null);

  // Text annotation pending click (Ф3.4.4)
  const [textAnnCoords, setTextAnnCoords] = useState<{ x: number; y: number } | null>(null);

  const theme = useTheme();
  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);
  const viewportZoom = useAppSelector((s) => s.canvasViewport.zoom);

  const stageBg = theme === 'dark' ? '#0f172a' : '#fafafa';
  const fowAlpha = theme === 'dark' ? 0.5 : 0.7;

  const fogEditMode = fogEditActive(myRole, mode, activeTool);
  const cursor = activeTool === 'ping' ? 'crosshair'
    : activeTool === 'ruler' ? 'crosshair'
    : activeTool === 'draw' ? 'crosshair'
    : activeTool === 'text' && myRole === 'GM' ? 'text'
    : activeTool === 'image' && myRole === 'GM' ? 'crosshair'
    : activeTool === 'fog' && myRole === 'GM' ? 'cell'
    : 'default';

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

  // Apply zoom from canvasViewport Redux when it changes via toolbar buttons
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scale({ x: viewportZoom, y: viewportZoom });
    stage.batchDraw();
  }, [viewportZoom]);

  function getSceneCoords(stage: Konva.Stage): { x: number; y: number } | null {
    const scale = stage.scaleX();
    const pos = stage.position();
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return { x: (pointer.x - pos.x) / scale, y: (pointer.y - pos.y) / scale };
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

  function handleStageMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = e.target.getStage();
    if (!stage) return;
    const coords = getSceneCoords(stage);
    if (!coords) return;

    if (activeTool === 'ruler') {
      rulerStartRef.current = coords;
    } else if (activeTool === 'draw' && myRole === 'GM') {
      drawStrokeIdRef.current = randomUUID();
      drawPointsRef.current = [coords.x, coords.y];
      lastDrawPtRef.current = coords;
    }
  }

  function handleStageMouseMove(e: Konva.KonvaEventObject<MouseEvent>): void {
    const stage = e.target.getStage();
    if (!stage) return;

    if (activeTool === 'ruler' && rulerStartRef.current && roomId) {
      const now = Date.now();
      if (now - lastRulerEmitRef.current < RULER_THROTTLE_MS) return;
      lastRulerEmitRef.current = now;
      const coords = getSceneCoords(stage);
      if (!coords) return;
      emitMeasure({ roomId, sceneId: scene.id, from: rulerStartRef.current, to: coords, userId: myUserId });
    } else if (activeTool === 'draw' && myRole === 'GM' && drawStrokeIdRef.current) {
      const coords = getSceneCoords(stage);
      if (!coords) return;
      const last = lastDrawPtRef.current;
      if (last) {
        const dx = coords.x - last.x;
        const dy = coords.y - last.y;
        if (Math.sqrt(dx * dx + dy * dy) < DRAW_MIN_DIST) return;
      }
      drawPointsRef.current.push(coords.x, coords.y);
      lastDrawPtRef.current = coords;

      // Optimistic local update
      const strokeId = drawStrokeIdRef.current;
      const color = getUserPingColor(myUserId);
      dispatch(applyDrawStroke({ roomId, sceneId: scene.id, strokeId, userId: myUserId, points: [...drawPointsRef.current], color, width: 3 }));
    }
  }

  function handleStageMouseUp(): void {
    if (activeTool === 'ruler') {
      rulerStartRef.current = null;
    } else if (activeTool === 'draw' && myRole === 'GM' && drawStrokeIdRef.current && roomId) {
      const strokeId = drawStrokeIdRef.current;
      const points = [...drawPointsRef.current];
      if (points.length >= 4) {
        emitDrawStroke({ roomId, sceneId: scene.id, strokeId, userId: myUserId, points, color: getUserPingColor(myUserId), width: 3 });
      }
      drawStrokeIdRef.current = null;
      drawPointsRef.current = [];
      lastDrawPtRef.current = null;
    }
  }

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.target !== e.target.getStage()) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const coords = getSceneCoords(stage);
    if (!coords) return;

    if (activeTool === 'ping' && roomId) {
      emitAnnotationPing({
        roomId,
        sceneId: scene.id,
        ...coords,
        color: getUserPingColor(myUserId),
        userId: myUserId,
        timestamp: Date.now(),
      });
    } else if (activeTool === 'text' && myRole === 'GM') {
      setTextAnnCoords(coords);
    }
  }

  const isDraggable = activeTool !== 'ruler' && activeTool !== 'draw' && activeTool !== 'text' && activeTool !== 'image';

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
        onMouseDown={handleStageMouseDown}
        onMouseMove={handleStageMouseMove}
        onMouseUp={handleStageMouseUp}
        onClick={handleStageClick}
        style={{ background: stageBg }}
      >
        <BackgroundLayer
          {...(backgroundUrl !== undefined ? { backgroundUrl } : {})}
          gridSize={scene.gridSize}
          gridWidth={scene.gridWidth}
          gridHeight={scene.gridHeight}
        />
        <TokenLayer
          sceneId={scene.id}
          tokens={scene.tokens}
          gridSize={scene.gridSize}
          myRole={myRole}
          myUserId={myUserId}
          {...(mode === 'edit' && {
            onTokenSelect: (id: string) => { dispatch(selectToken(id)); },
          })}
        />
        <AnnotationLayer gridSize={scene.gridSize} />
        <FogOfWarLayer
          fogMaskBase64={scene.fogMaskBase64}
          gridSize={scene.gridSize}
          gridWidth={scene.gridWidth}
          gridHeight={scene.gridHeight}
          myRole={myRole}
          fowAlpha={fowAlpha}
        />
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
    </div>
  );
}
