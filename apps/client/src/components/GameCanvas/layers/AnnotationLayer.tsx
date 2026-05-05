import { useEffect, useMemo, useRef, useState } from 'react';
import { Layer, Circle, Group, Image as KonvaImage, Line, Rect, Text, Transformer } from 'react-konva';
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
import { moveSceneObjectOptimistic, selectSceneObject, transformSceneObjectOptimistic } from '../../../store/scene';
import { fetchAsset } from '../../../store/assets';
import { emitObjectMove, emitObjectTransform } from '../../../api/socket';
import { useImage } from '../useImage';
import { computeSelectionBox } from '../selectionBox';

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
  canEdit: boolean;
  isSelected: boolean;
  myRole: Role;
  roomId: string;
  sceneId: string;
  onContextMenu?: (objectId: string, x: number, y: number) => void;
}

function ObjectNode({ object, canEdit, isSelected, myRole, roomId, sceneId, onContextMenu }: ObjectNodeProps): JSX.Element {
  const dispatch = useAppDispatch();
  const lastMoveAt = useRef(0);
  // Read the signed URL from the assets cache. If the asset isn't there yet
  // (e.g. mid-session arrival via scene snapshot), fetch a fresh DTO so the
  // signature is valid. <img>/Konva.Image can't send Authorization headers,
  // so a hard-coded `/api/assets/:id/file` would always 403.
  const assetId = object.type === 'image' ? object.assetId : undefined;
  const cachedAsset = useAppSelector((s) => (assetId ? s.assets.byId[assetId] : undefined));
  const activeTool = useAppSelector((s) => s.canvasViewport.activeTool);
  useEffect(() => {
    if (assetId && !cachedAsset) {
      void dispatch(fetchAsset(assetId));
    }
  }, [assetId, cachedAsset, dispatch]);
  const image = useImage(cachedAsset?.url);

  // Locked objects are selectable (GM can right-click → unlock) but NOT draggable.
  // Applies to all types — text/stroke respect locked flag too.
  const isLocked = object.locked === true;
  const isDraggable = canEdit && !isLocked;

  function broadcastMove(x: number, y: number, force = false): void {
    const now = Date.now();
    if (!force && now - lastMoveAt.current < OBJECT_MOVE_THROTTLE_MS) return;
    lastMoveAt.current = now;
    dispatch(moveSceneObjectOptimistic({ objectId: object.id, x, y }));
    emitObjectMove({ roomId, sceneId, objectId: object.id, x, y });
  }

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
    if (!isDraggable) return;
    const node = e.target;
    broadcastMove(Math.max(0, node.x()), Math.max(0, node.y()));
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    if (!isDraggable) return;
    const node = e.target;
    const x = Math.max(0, node.x());
    const y = Math.max(0, node.y());
    node.position({ x, y });
    broadcastMove(x, y, true);
  }

  function handleMouseDown(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (activeTool === 'fog' || activeTool === 'draw') return;
    const additive = e.evt.shiftKey;
    dispatch(selectSceneObject({ id: object.id, additive }));
  }

  function handleMouseEnter(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (myRole !== 'GM' || !isDraggable) return;
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = 'pointer';
  }

  function handleMouseLeave(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (myRole !== 'GM' || !isDraggable) return;
    const stage = e.target.getStage();
    if (stage) stage.container().style.cursor = 'default';
  }

  function handleContextMenu(e: Konva.KonvaEventObject<PointerEvent>): void {
    if (myRole !== 'GM') return;
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos || !onContextMenu) return;
    // Single-select the object on right-click for visual feedback
    dispatch(selectSceneObject({ id: object.id }));
    onContextMenu(object.id, pos.x, pos.y);
  }

  const objectRotation = object.type === 'image' ? (object.rotation ?? 0) : 0;

  // id attr needed only for image — Transformer uses stage.findOne('#id') lookup.
  const groupId = object.type === 'image' ? object.id : undefined;

  // Selection rect shown for GM when this object is selected (all types — Mini-E).
  const showSelectionRect = myRole === 'GM' && isSelected;

  return (
    <Group
      {...(groupId !== undefined ? { id: groupId } : {})}
      x={object.x}
      y={object.y}
      rotation={objectRotation}
      draggable={isDraggable}
      listening={canEdit}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
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
      {/* Selection highlight rect for GM multi-select — all object types (Mini-E) */}
      {showSelectionRect && (() => {
        const box = computeSelectionBox(object);
        return (
          <Rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            stroke="#3b82f6"
            strokeWidth={2}
            listening={false}
          />
        );
      })()}
    </Group>
  );
}

interface AnnotationLayerProps {
  gridSize?: number;
  roomId: string;
  sceneId: string;
  myRole: Role;
  onObjectContextMenu?: (objectId: string, x: number, y: number) => void;
}

export default function AnnotationLayer({
  gridSize = 64,
  roomId,
  sceneId,
  myRole,
  onObjectContextMenu,
}: AnnotationLayerProps): JSX.Element {
  const dispatch = useAppDispatch();
  const pings = useAppSelector((s) => s.annotations.activePings);
  const measures = useAppSelector((s) => s.annotations.activeMeasures);
  const annotations = useAppSelector((s) => s.scene.current?.annotations);
  const selectedIds = useAppSelector((s) => s.scene.selectedSceneObjectIds);
  const rawObjects = useMemo(
    () => toObjects(
      annotations?.strokes ?? [],
      annotations?.texts ?? [],
      annotations?.images ?? [],
      annotations?.objects,
    ),
    [annotations],
  );
  // Render order: sort by zIndex ascending (stable — same-zIndex objects keep insertion order).
  const sceneObjects = useMemo(
    () => [...rawObjects].sort((a, b) => a.zIndex - b.zIndex),
    [rawObjects],
  );
  const canEditObjects = myRole === 'GM';

  // Konva Transformer ref — wired via stage.findOne(`#${selectedId}`) (Fix D)
  const trRef = useRef<Konva.Transformer | null>(null);
  // Ctrl-snap ref — read by boundBoxFunc via closure (Fix D keyboard modifiers)
  const ctrlSnapRef = useRef(false);

  // Transformer shown only when EXACTLY ONE image is selected and it is not locked (Sess 3 Mini-C).
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const selectedObject = useMemo(
    () => (selectedId !== undefined
      ? sceneObjects.find((o) => o.id === selectedId && o.type === 'image')
      : undefined),
    [sceneObjects, selectedId],
  );
  // Do not show Transformer for locked objects — GM still sees selection rect.
  const isSelectedLocked = selectedObject?.locked === true;
  const showTransformer = myRole === 'GM' && !!selectedObject && !isSelectedLocked;

  // Wire Transformer to Konva node by ID (Fix D — stage.findOne lookup)
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (selectedId === undefined || !showTransformer) {
      tr.nodes([]);
      return;
    }
    const stage = tr.getStage();
    const node = stage?.findOne(`#${selectedId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedId, showTransformer]);

  // Keyboard modifiers: Shift = keepRatio + rotation snaps; Ctrl = grid-snap (Fix D)
  useEffect(() => {
    if (myRole !== 'GM') return;

    const ROTATION_SNAPS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
      180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];

    function handleKeyDown(e: KeyboardEvent): void {
      const tr = trRef.current;
      if (!tr) return;
      if (e.key === 'Shift') {
        tr.keepRatio(true);
        tr.rotationSnaps(ROTATION_SNAPS);
        tr.getLayer()?.batchDraw();
      }
      if (e.key === 'Control') {
        ctrlSnapRef.current = true;
      }
    }

    function handleKeyUp(e: KeyboardEvent): void {
      const tr = trRef.current;
      if (!tr) return;
      if (e.key === 'Shift') {
        tr.keepRatio(false);
        tr.rotationSnaps([]);
        tr.getLayer()?.batchDraw();
      }
      if (e.key === 'Control') {
        ctrlSnapRef.current = false;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [myRole]);

  // onTransformEnd handler — CRITICAL order: dispatch → scale reset → emit (Fix D RED 3)
  function handleTransformEnd(e: Konva.KonvaEventObject<Event>): void {
    if (!selectedObject || selectedObject.type !== 'image') return;
    const node = e.target as Konva.Group;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rawRot = node.rotation();

    const baseWidth = selectedObject.width ?? gridSize;
    const baseHeight = selectedObject.height ?? gridSize;

    let newWidth = Math.max(gridSize, Math.round(baseWidth * scaleX));
    let newHeight = Math.max(gridSize, Math.round(baseHeight * scaleY));

    // Ctrl-snap: round to gridSize multiples
    if (ctrlSnapRef.current) {
      newWidth = Math.max(gridSize, Math.round(newWidth / gridSize) * gridSize);
      newHeight = Math.max(gridSize, Math.round(newHeight / gridSize) * gridSize);
    }

    const newRotation = ((rawRot % 360) + 360) % 360;
    // Read node position AFTER transform — Konva Transformer repositions the Group
    // during corner-resize and rotation, so x/y may differ from pre-transform values.
    const newX = node.x();
    const newY = node.y();

    // Order CRITICAL (Fix D RED 3): dispatch first, then reset scale, then emit
    dispatch(transformSceneObjectOptimistic({
      objectId: selectedObject.id,
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      rotation: newRotation,
    }));

    // Reset Konva scale to identity AFTER dispatch so React re-render uses new width/height
    node.scaleX(1);
    node.scaleY(1);

    emitObjectTransform({
      roomId,
      sceneId,
      objectId: selectedObject.id,
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      rotation: newRotation,
    });
  }

  return (
    <Layer listening={true}>
      {sceneObjects.map((object) => (
        <ObjectNode
          key={object.id}
          object={object}
          canEdit={canEditObjects}
          isSelected={selectedIds.includes(object.id)}
          myRole={myRole}
          roomId={roomId}
          sceneId={sceneId}
          {...(onObjectContextMenu !== undefined ? { onContextMenu: onObjectContextMenu } : {})}
        />
      ))}
      {showTransformer && (
        <Transformer
          ref={trRef}
          rotateEnabled={true}
          boundBoxFunc={(oldBox, newBox) => {
            // Clamp to minimum 1 grid cell; apply Ctrl-snap via ref closure
            let { width, height } = newBox;
            const minSize = gridSize;
            if (ctrlSnapRef.current) {
              width = Math.max(minSize, Math.round(Math.abs(width) / minSize) * minSize);
              height = Math.max(minSize, Math.round(Math.abs(height) / minSize) * minSize);
            } else {
              width = Math.max(minSize, Math.abs(width));
              height = Math.max(minSize, Math.abs(height));
            }
            return { ...newBox, width, height };
          }}
          onTransformEnd={handleTransformEnd}
        />
      )}
      {pings.map((ping) => (
        <PingCircle key={ping.timestamp} ping={ping} />
      ))}
      {measures.map((m) => (
        <RulerLine key={m.userId} measure={m} gridSize={gridSize} />
      ))}
    </Layer>
  );
}
