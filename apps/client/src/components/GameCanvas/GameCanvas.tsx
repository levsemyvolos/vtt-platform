import { useEffect, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../store';
import { selectToken } from '../../store/scene';
import { useTheme } from '../../hooks/useTheme';
import BackgroundLayer from './layers/BackgroundLayer';
import TokenLayer from './layers/TokenLayer';
import AnnotationLayer from './layers/AnnotationLayer';
import FogOfWarLayer from './layers/FogOfWarLayer';
import AddTokenButton from './AddTokenButton';
import { getUserPingColor } from './layers/AnnotationLayer';
import { emitAnnotationPing } from '../../api/socket';
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

  const theme = useTheme();
  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);
  const viewportZoom = useAppSelector((s) => s.canvasViewport.zoom);

  const stageBg = theme === 'dark' ? '#0f172a' : '#fafafa';
  const fowAlpha = theme === 'dark' ? 0.5 : 0.7;

  const fogEditMode = fogEditActive(myRole, mode, activeTool);
  const cursor = activeTool === 'ping' ? 'crosshair'
    : activeTool === 'fog' && myRole === 'GM' ? 'cell'
    : activeTool === 'draw' ? 'crosshair'
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

  function handleStageClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (activeTool !== 'ping') return;
    if (e.target !== e.target.getStage()) return;

    const stage = e.target.getStage();
    if (!stage || !roomId) return;

    const scale = stage.scaleX();
    const pos = stage.position();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const x = (pointer.x - pos.x) / scale;
    const y = (pointer.y - pos.y) / scale;

    emitAnnotationPing({
      roomId,
      sceneId: scene.id,
      x,
      y,
      color: getUserPingColor(myUserId),
      userId: myUserId,
      timestamp: Date.now(),
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
        draggable
        onWheel={handleWheel}
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
        <AnnotationLayer />
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
    </div>
  );
}
