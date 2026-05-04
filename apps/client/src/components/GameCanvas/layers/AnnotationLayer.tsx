import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Circle, Group, Image as KonvaImage, Line, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type {
  AnnotationPingPayload,
  DrawStroke,
  ImageAnnotation,
  MeasurePayload,
  Role,
  SceneObject,
  TextAnnotation,
} from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../../store';
import { moveSceneObjectOptimistic } from '../../../store/scene';
import { emitObjectDelete, emitObjectMove } from '../../../api/socket';
import { apiMoveAnnotation } from '../../../api/scenes';
import { useImage } from '../useImage';

const PING_DURATION_MS = 3000;
const PING_FADE_START_MS = 2000;
const OBJECT_MOVE_THROTTLE_MS = 50;

const PING_PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

export function getUserPingColor(userId: string): string {
  const hash = [...userId].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PING_PALETTE[hash % PING_PALETTE.length]!;
}

function PingCircle({ ping }: { ping: AnnotationPingPayload }): JSX.Element {
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed >= PING_DURATION_MS) {
        clearInterval(id);
        return;
      }
      if (elapsed >= PING_FADE_START_MS) {
        const fadeProgress = (elapsed - PING_FADE_START_MS) / (PING_DURATION_MS - PING_FADE_START_MS);
        setOpacity(Math.max(0, 1 - fadeProgress));
      }
    }, 50);
    return () => clearInterval(id);
  }, []);

  const color = ping.color || getUserPingColor(ping.userId);

  return (
    <Circle
      x={ping.x}
      y={ping.y}
      radius={24}
      fill={color}
      opacity={opacity}
      shadowColor={color}
      shadowBlur={12}
      shadowOpacity={0.6}
      listening={false}
    />
  );
}

function RulerLine({ measure, gridSize }: { measure: MeasurePayload; gridSize: number }): JSX.Element {
  const color = getUserPingColor(measure.userId);
  const dx = measure.to.x - measure.from.x;
  const dy = measure.to.y - measure.from.y;
  const distPx = Math.sqrt(dx * dx + dy * dy);
  const distUnits = Math.round((distPx / gridSize) * 10) / 10;
  const midX = (measure.from.x + measure.to.x) / 2;
  const midY = (measure.from.y + measure.to.y) / 2;

  return (
    <>
      <Line
        points={[measure.from.x, measure.from.y, measure.to.x, measure.to.y]}
        stroke={color}
        strokeWidth={2}
        dash={[8, 4]}
        listening={false}
      />
      <Text
        x={midX + 4}
        y={midY - 14}
        text={`${distUnits} кл`}
        fill={color}
        fontSize={13}
        fontStyle="bold"
        listening={false}
      />
    </>
  );
}

function toObjects(
  strokes: DrawStroke[],
  texts: TextAnnotation[],
  images: ImageAnnotation[],
  objects: SceneObject[] | undefined,
): SceneObject[] {
  if (objects?.length) return objects;
  return [
    ...strokes.map((stroke, index): SceneObject => ({
      id: stroke.strokeId,
      type: 'stroke',
      userId: stroke.userId,
      x: stroke.x ?? 0,
      y: stroke.y ?? 0,
      zIndex: index,
      points: stroke.points,
      color: stroke.color,
      strokeWidth: stroke.width,
    })),
    ...texts.map((ann, index): SceneObject => ({
      id: ann.id,
      type: 'text',
      userId: ann.userId,
      x: ann.x,
      y: ann.y,
      zIndex: strokes.length + index,
      text: ann.text,
      fontSize: ann.fontSize,
      color: ann.color,
    })),
    ...images.map((ann, index): SceneObject => ({
      id: ann.id,
      type: 'image',
      userId: ann.userId,
      x: ann.x,
      y: ann.y,
      zIndex: strokes.length + texts.length + index,
      assetId: ann.assetId,
      width: ann.width,
      height: ann.height,
    })),
  ];
}

interface ObjectNodeProps {
  object: SceneObject;
  draggable: boolean;
  roomId: string;
  sceneId: string;
}

function ObjectNode({ object, draggable, roomId, sceneId }: ObjectNodeProps): JSX.Element {
  const dispatch = useAppDispatch();
  const lastMoveAt = useRef(0);
  const image = useImage(object.type === 'image' ? `/api/assets/${object.assetId}/file` : undefined);

  function broadcastMove(x: number, y: number, force = false): void {
    const now = Date.now();
    if (!force && now - lastMoveAt.current < OBJECT_MOVE_THROTTLE_MS) return;
    lastMoveAt.current = now;
    dispatch(moveSceneObjectOptimistic({ objectId: object.id, x, y }));
    emitObjectMove({ roomId, sceneId, objectId: object.id, x, y });
  }

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
    if (!draggable) return;
    const node = e.target;
    broadcastMove(Math.max(0, node.x()), Math.max(0, node.y()));
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    if (!draggable) return;
    const node = e.target;
    const x = Math.max(0, node.x());
    const y = Math.max(0, node.y());
    node.position({ x, y });
    broadcastMove(x, y, true);
    void apiMoveAnnotation(sceneId, object.id, { x, y });
  }

  function handleDelete(): void {
    if (!draggable) return;
    emitObjectDelete({ roomId, sceneId, objectId: object.id });
  }

  return (
    <Group
      x={object.x}
      y={object.y}
      draggable={draggable}
      listening={draggable}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDblClick={handleDelete}
      onDblTap={handleDelete}
    >
      {object.type === 'stroke' && (
        <Line
          points={object.points}
          stroke={object.color}
          strokeWidth={object.strokeWidth}
          lineCap="round"
          lineJoin="round"
          tension={0.3}
        />
      )}
      {object.type === 'text' && (
        <Text
          text={object.text}
          fontSize={object.fontSize}
          fill={object.color}
          fontStyle="bold"
          shadowColor="rgba(0,0,0,0.6)"
          shadowBlur={4}
          shadowOffsetX={1}
          shadowOffsetY={1}
        />
      )}
      {object.type === 'image' && (
        image ? (
          <KonvaImage image={image} width={object.width} height={object.height} />
        ) : (
          <Rect width={object.width} height={object.height} fill="#334155" stroke="#94a3b8" strokeWidth={1} />
        )
      )}
    </Group>
  );
}

interface AnnotationLayerProps {
  gridSize?: number;
  roomId: string;
  sceneId: string;
  myRole: Role;
}

export default function AnnotationLayer({
  gridSize = 64,
  roomId,
  sceneId,
  myRole,
}: AnnotationLayerProps): JSX.Element {
  const pings = useAppSelector((s) => s.annotations.activePings);
  const measures = useAppSelector((s) => s.annotations.activeMeasures);
  const annotations = useAppSelector((s) => s.scene.current?.annotations);
  const sceneObjects = useMemo(
    () => toObjects(
      annotations?.strokes ?? [],
      annotations?.texts ?? [],
      annotations?.images ?? [],
      annotations?.objects,
    ),
    [annotations],
  );
  const canEditObjects = myRole === 'GM';

  return (
    <Layer listening={true}>
      {sceneObjects.map((object) => (
        <ObjectNode
          key={object.id}
          object={object}
          draggable={canEditObjects}
          roomId={roomId}
          sceneId={sceneId}
        />
      ))}
      {pings.map((ping) => (
        <PingCircle key={ping.timestamp} ping={ping} />
      ))}
      {measures.map((m) => (
        <RulerLine key={m.userId} measure={m} gridSize={gridSize} />
      ))}
    </Layer>
  );
}
