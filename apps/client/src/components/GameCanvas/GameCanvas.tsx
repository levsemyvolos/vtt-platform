import { useEffect, useRef, useState } from 'react';
import { Stage } from 'react-konva';
import type Konva from 'konva';
import type { Role, SceneDTO } from '@vtt/shared';
import { useAppSelector } from '../../store';
import { useTheme } from '../../hooks/useTheme';
import BackgroundLayer from './layers/BackgroundLayer';
import TokenLayer from './layers/TokenLayer';
import AnnotationLayer from './layers/AnnotationLayer';
import FogOfWarLayer from './layers/FogOfWarLayer';
import AddTokenButton from './AddTokenButton';
import AnnotationToolbar, { type AnnotationTool } from './AnnotationToolbar';
import { getUserPingColor } from './layers/AnnotationLayer';
import { emitAnnotationPing } from '../../api/socket';

export interface GameCanvasProps {
  scene: SceneDTO;
  myRole: Role;
  myUserId: string;
  /** Optional URL for the scene background bitmap (Ф2.2.5). */
  backgroundUrl?: string;
}

const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.08;

/**
 * Top-level Konva `Stage` that composes the four scene layers in the order
 * mandated by §2.13 table 2.9 (Background → Tokens → Annotations → FoW).
 *
 * Pan: drag on empty stage area (Stage `draggable`). Token drags do not
 * propagate so the field never accidentally pans while moving a token.
 *
 * Zoom: mouse wheel, anchored to cursor position so the cell under the
 * cursor stays under the cursor across zoom levels.
 *
 * Annotation ping (Ф3.4.1): click on Stage when ping tool is active →
 * emit annotation:ping with canvas-space coordinates.
 */
export default function GameCanvas({
  scene,
  myRole,
  myUserId,
  backgroundUrl,
}: GameCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>('ping');

  const theme = useTheme();
  const roomId = useAppSelector((s) => s.room.currentRoom?.id ?? '');
  const stageBg = theme === 'dark' ? '#0f172a' : '#fafafa';
  const fowAlpha = theme === 'dark' ? 0.5 : 0.7;

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
    if (annotationTool !== 'ping') return;
    // Only fire on direct Stage click, not on token or other shape clicks.
    if (e.target !== e.target.getStage()) return;

    const stage = e.target.getStage();
    if (!stage || !roomId) return;

    const scale = stage.scaleX();
    const pos = stage.position();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    // Convert from viewport to scene-space (undo pan + zoom).
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
    <div ref={containerRef} className="game-canvas" style={{ width: '100%', height: '100%' }}>
      <div className="canvas-toolbar">
        <AddTokenButton myRole={myRole} sceneId={scene.id} />
        <AnnotationToolbar activeTool={annotationTool} onChange={setAnnotationTool} />
      </div>
      <Stage
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
    </div>
  );
}
