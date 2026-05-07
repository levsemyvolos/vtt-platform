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
import { recordUndo } from '../../../store/undoDispatcher';
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
      layer: stroke.layer ?? 'overlay',
      visibility: stroke.visibility ?? 'all',
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
      layer: ann.layer ?? 'overlay',
      visibility: ann.visibility ?? 'all',
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
      layer: ann.layer ?? 'tile',
      visibility: ann.visibility ?? 'all',
    })),
  ];
}

/** Renders the visual primitive for a single SceneObject (stroke/text/image).
 *  Extracted from ObjectNode to keep cyclomatic complexity ≤ 10 (lint gate). */
function ObjectShape({ object, image }: { object: SceneObject; image: HTMLImageElement | null | undefined }): JSX.Element | null {
  if (object.type === 'stroke') {
    return (
      <Line
        points={object.points}
        stroke={object.color}
        strokeWidth={object.strokeWidth}
        lineCap="round"
        lineJoin="round"
        tension={0.3}
      />
    );
  }
  if (object.type === 'text') {
    return (
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
    );
  }
  if (object.type === 'image') {
    return image
      ? <KonvaImage image={image} width={object.width} height={object.height} />
      : <Rect width={object.width} height={object.height} fill="#334155" stroke="#94a3b8" strokeWidth={1} />;
  }
  return null;
}

/** Blue selection-highlight rect rendered on top of an object when GM-selected.
 *  Extracted from ObjectNode to keep cyclomatic complexity ≤ 10 (lint gate). */
function SelectionRect({ object }: { object: SceneObject }): JSX.Element {
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
}

/** Permanent amber dashed marker for GM-only objects (visible to GM only).
 *  Extracted from ObjectNode to keep cyclomatic complexity ≤ 10 (lint gate). */
function GmOnlyMarker({ object }: { object: SceneObject }): JSX.Element {
  const box = computeSelectionBox(object);
  return (
    <Rect
      x={box.x}
      y={box.y}
      width={box.w}
      height={box.h}
      stroke="#fbbf24"
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  );
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

function ObjectNode({ object, canEdit, isSelected, myRole, roomId, sceneId, onContextMenu }: ObjectNodeProps): JSX.Element | null {
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

  // Stroke uses Konva offset to pivot transforms around its visual centroid.
  // The Group is rendered at (object.x + pivotX, object.y + pivotY); when we read
  // node.x()/y() back after drag/transform, subtract pivot to recover object.x/y.
  const dragPivot = object.type === 'stroke' ? computeStrokePivot(object.points) : { x: 0, y: 0 };

  // Sess 7.5: capture the pre-drag position the first time broadcastMove fires
  // for this drag gesture, so we can record an undo entry on dragEnd.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  function broadcastMove(x: number, y: number, force = false): void {
    const now = Date.now();
    if (!force && now - lastMoveAt.current < OBJECT_MOVE_THROTTLE_MS) return;
    lastMoveAt.current = now;
    if (dragStartRef.current === null) dragStartRef.current = { x: object.x, y: object.y };
    dispatch(moveSceneObjectOptimistic({ objectId: object.id, x, y }));
    emitObjectMove({ roomId, sceneId, objectId: object.id, x, y });
    if (force) {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      // Skip recording when the drag effectively didn't move the object.
      if (Math.abs(start.x - x) > 0.5 || Math.abs(start.y - y) > 0.5) {
        recordUndo({
          kind: 'object_move',
          before: { id: object.id, x: start.x, y: start.y },
          after: { id: object.id, x, y },
        });
      }
    }
  }

  function readDragXY(node: Konva.Node): { x: number; y: number } {
    // Subtract pivot for stroke (offset-shifted Group); image/text have pivot 0.
    // Image x/y are clamped ≥ 0 to keep them on-canvas (Sess 2); stroke can go
    // negative because the visual position is determined by points + transform.
    const rawX = node.x() - dragPivot.x;
    const rawY = node.y() - dragPivot.y;
    if (object.type === 'image') {
      return { x: Math.max(0, rawX), y: Math.max(0, rawY) };
    }
    return { x: rawX, y: rawY };
  }

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
    if (!isDraggable) return;
    const { x, y } = readDragXY(e.target);
    broadcastMove(x, y);
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    if (!isDraggable) return;
    const node = e.target;
    const { x, y } = readDragXY(node);
    // Re-position node to match what we dispatched (add pivot back so Konva
    // origin matches the next React render's x = object.x + pivot.x).
    node.position({ x: x + dragPivot.x, y: y + dragPivot.y });
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

  // Defensive: gm-only objects should never reach a Player's render tree (Mini-A/B filter
  // them out upstream). If one slips through anyway, hide it entirely.
  const meta = computeObjectMeta(object, myRole, isSelected);
  if (meta === null) return null;

  return (
    <Group
      {...(meta.groupId !== undefined ? { id: meta.groupId } : {})}
      x={object.x + meta.offsetX}
      y={object.y + meta.offsetY}
      rotation={meta.rotation}
      scaleX={meta.scaleX}
      scaleY={meta.scaleY}
      offsetX={meta.offsetX}
      offsetY={meta.offsetY}
      opacity={meta.opacity}
      draggable={isDraggable}
      listening={canEdit}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
    >
      <ObjectShape object={object} image={image} />
      {meta.showSelection && <SelectionRect object={object} />}
      {meta.showGmOnlyMarker && <GmOnlyMarker object={object} />}
    </Group>
  );
}

interface ObjectMeta {
  groupId: string | undefined;
  rotation: number;
  /** Konva Group scaleX (Sess 7, 2β — non-1 only for stroke matrix transform). */
  scaleX: number;
  /** Konva Group scaleY (Sess 7, 2β — non-1 only for stroke matrix transform). */
  scaleY: number;
  /** Konva Group offset — sets the rotation/scale pivot at the stroke's visual
   *  centroid so transforms don't visually teleport the stroke (Sess 7 fix). 0 for
   *  image/text. */
  offsetX: number;
  offsetY: number;
  opacity: number;
  showSelection: boolean;
  showGmOnlyMarker: boolean;
}

/** Bounding-box centroid of a stroke's flat points array (Sess 7). Used as the
 *  Konva Group's offset/pivot so rotations and scales happen around the visual
 *  center of the stroke instead of (0,0) in scene coords. */
function computeStrokePivot(points: number[]): { x: number; y: number } {
  if (points.length < 2) return { x: 0, y: 0 };
  let minX = points[0]!;
  let maxX = points[0]!;
  let minY = points[1]!;
  let maxY = points[1]!;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

/** Per-type Konva transform: groupId, rotation, scale, and pivot offset.
 *  Stroke uses offset = points centroid so Transformer rotations/scales happen
 *  around the visual center; image/text use offset (0,0) (no pivot shift). */
function getTypeTransform(object: SceneObject): {
  groupId: string; rotation: number; scaleX: number; scaleY: number;
  offsetX: number; offsetY: number;
} {
  const groupId = object.id;
  const rotation = object.rotation ?? 0;
  if (object.type === 'stroke') {
    const pivot = computeStrokePivot(object.points);
    return {
      groupId, rotation,
      scaleX: object.scaleX ?? 1,
      scaleY: object.scaleY ?? 1,
      offsetX: pivot.x,
      offsetY: pivot.y,
    };
  }
  return { groupId, rotation, scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
}

/** Computes per-render meta for ObjectNode (visibility, opacity, rotation, group id, marker flags).
 *  Returns null when the object should not be rendered (defensive gm-only-for-Player guard).
 *  Extracted to keep ObjectNode cyclomatic complexity ≤ 10 (lint gate). */
function computeObjectMeta(
  object: SceneObject,
  myRole: Role,
  isSelected: boolean,
): ObjectMeta | null {
  const isGM = myRole === 'GM';
  const isGmOnly = object.visibility === 'gm-only';
  if (isGmOnly && !isGM) return null;
  const { groupId, rotation, scaleX, scaleY, offsetX, offsetY } = getTypeTransform(object);
  return {
    groupId,
    rotation,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    opacity: isGmOnly && isGM ? 0.6 : 1,
    showSelection: isGM && isSelected,
    showGmOnlyMarker: isGmOnly && isGM && !isSelected,
  };
}

interface AnnotationLayerProps {
  gridSize?: number;
  roomId: string;
  sceneId: string;
  myRole: Role;
  /** Filter objects by their `layer` field. */
  layerFilter: 'tile' | 'overlay';
  /**
   * When true, pings and ruler measures are rendered inside this Konva Layer.
   * Set true only on the overlay instance so transient helpers appear above tokens.
   */
  renderTransientHelpers: boolean;
  onObjectContextMenu?: (objectId: string, x: number, y: number) => void;
}

export default function AnnotationLayer({
  gridSize = 64,
  roomId,
  sceneId,
  myRole,
  layerFilter,
  renderTransientHelpers,
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
  // Filter by layerFilter, then sort by zIndex ascending.
  const sceneObjects = useMemo(
    () => [...rawObjects]
      .filter((o) => o.layer === layerFilter)
      .sort((a, b) => a.zIndex - b.zIndex),
    [rawObjects, layerFilter],
  );
  const canEditObjects = myRole === 'GM';

  // Konva Transformer ref — wired via stage.findOne(`#${selectedId}`) (Fix D)
  const trRef = useRef<Konva.Transformer | null>(null);
  // Ctrl-snap ref — read by boundBoxFunc via closure (Fix D keyboard modifiers)
  const ctrlSnapRef = useRef(false);

  // Transformer shown when EXACTLY ONE object is selected, it is not locked,
  // AND the selected object belongs to THIS layer (tile vs overlay).
  // Sess 7: extended from image-only to text/stroke as well — type-specific commit
  // logic in handleTransformEnd (image bakes w/h; text scales fontSize; stroke uses matrix).
  const selectedId = selectedIds.length === 1 ? selectedIds[0] : undefined;
  const selectedObject = useMemo(
    () => (selectedId !== undefined
      ? sceneObjects.find((o) => o.id === selectedId)
      : undefined),
    [sceneObjects, selectedId],
  );
  // Do not show Transformer for locked objects — GM still sees selection rect.
  const isSelectedLocked = selectedObject?.locked === true;
  // Only render Transformer in the layer that actually contains the selected object.
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

  // onTransformEnd handler — CRITICAL order: dispatch → scale reset → emit (Fix D RED 3).
  // Sess 7: branch by SceneObject type — image bakes w/h; text scales fontSize; stroke
  // bakes scaleX/scaleY into the SceneObject (matrix transform — points[] unchanged, 2β).
  function handleTransformEnd(e: Konva.KonvaEventObject<Event>): void {
    if (!selectedObject) return;
    const node = e.target as Konva.Group;
    if (selectedObject.type === 'image') {
      commitImageTransform(node, selectedObject);
    } else if (selectedObject.type === 'text') {
      commitTextTransform(node, selectedObject);
    } else {
      commitStrokeTransform(node, selectedObject);
    }
  }

  /** Image transform commit — bakes scale into width/height (Sess 2). */
  function commitImageTransform(node: Konva.Group, image: SceneObject & { type: 'image' }): void {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rawRot = node.rotation();

    let newWidth = Math.max(gridSize, Math.round((image.width ?? gridSize) * scaleX));
    let newHeight = Math.max(gridSize, Math.round((image.height ?? gridSize) * scaleY));
    if (ctrlSnapRef.current) {
      newWidth = Math.max(gridSize, Math.round(newWidth / gridSize) * gridSize);
      newHeight = Math.max(gridSize, Math.round(newHeight / gridSize) * gridSize);
    }

    const newRotation = ((rawRot % 360) + 360) % 360;
    const newX = node.x();
    const newY = node.y();

    const before = {
      id: image.id, x: image.x, y: image.y, rotation: image.rotation ?? 0,
      width: image.width, height: image.height,
    };
    const after = {
      id: image.id, x: newX, y: newY, rotation: newRotation,
      width: newWidth, height: newHeight,
    };
    dispatch(transformSceneObjectOptimistic({ objectId: image.id, ...after }));
    node.scaleX(1);
    node.scaleY(1);
    emitObjectTransform({ roomId, sceneId, objectId: image.id, ...after });
    recordUndo({ kind: 'object_transform', before, after });
  }

  /** Text transform commit — scales fontSize uniformly (Sess 7, 1α). */
  function commitTextTransform(node: Konva.Group, text: SceneObject & { type: 'text' }): void {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rawRot = node.rotation();
    const factor = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
    const FONT_MIN = 8;
    const FONT_MAX = 200;
    const newFontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(text.fontSize * factor)));

    const newRotation = ((rawRot % 360) + 360) % 360;
    const newX = node.x();
    const newY = node.y();

    const before = {
      id: text.id, x: text.x, y: text.y, rotation: text.rotation ?? 0, fontSize: text.fontSize,
    };
    const after = {
      id: text.id, x: newX, y: newY, rotation: newRotation, fontSize: newFontSize,
    };
    dispatch(transformSceneObjectOptimistic({ objectId: text.id, ...after }));
    node.scaleX(1);
    node.scaleY(1);
    emitObjectTransform({ roomId, sceneId, objectId: text.id, ...after });
    recordUndo({ kind: 'object_transform', before, after });
  }

  /** Stroke transform commit — bakes the new absolute scale/rotation into
   *  SceneObject.scaleX/scaleY/rotation without modifying points[] (Sess 7, 2β —
   *  non-destructive matrix transform).
   *
   *  Two subtleties:
   *  1) Konva's Transformer mutates node.scaleX/Y to the NEW absolute values
   *     (it accounts for the previous scale internally), so we use them directly
   *     — multiplying by the old scaleX would compound the gesture (Sess 7 fix).
   *  2) The Group is rendered with offset = points centroid (see getTypeTransform),
   *     so node.x()/y() report the position of that pivot in scene coords. Subtract
   *     the pivot to recover the stored object.x/y semantics. */
  function commitStrokeTransform(node: Konva.Group, stroke: SceneObject & { type: 'stroke' }): void {
    const STROKE_MIN = 0.1;
    const STROKE_MAX = 10;
    const newScaleX = Math.max(STROKE_MIN, Math.min(STROKE_MAX, node.scaleX()));
    const newScaleY = Math.max(STROKE_MIN, Math.min(STROKE_MAX, node.scaleY()));
    const newRotation = ((node.rotation() % 360) + 360) % 360;
    const pivot = computeStrokePivot(stroke.points);
    const newX = node.x() - pivot.x;
    const newY = node.y() - pivot.y;

    const before = {
      id: stroke.id, x: stroke.x, y: stroke.y, rotation: stroke.rotation ?? 0,
      scaleX: stroke.scaleX ?? 1, scaleY: stroke.scaleY ?? 1,
    };
    const after = {
      id: stroke.id, x: newX, y: newY, rotation: newRotation,
      scaleX: newScaleX, scaleY: newScaleY,
    };
    dispatch(transformSceneObjectOptimistic({ objectId: stroke.id, ...after }));
    emitObjectTransform({ roomId, sceneId, objectId: stroke.id, ...after });
    recordUndo({ kind: 'object_transform', before, after });
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
            // Image: clamp to ≥ 1 grid cell; apply Ctrl-snap via ref closure (Sess 2).
            // Text/stroke: looser clamp (≥ 4 px) — bounding box is derived from
            // fontSize/points, so grid-cell minimum doesn't make sense (Sess 7).
            let { width, height } = newBox;
            const isImage = selectedObject?.type === 'image';
            const minSize = isImage ? gridSize : 4;
            if (isImage && ctrlSnapRef.current) {
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
      {renderTransientHelpers && pings.map((ping) => (
        <PingCircle key={ping.timestamp} ping={ping} />
      ))}
      {renderTransientHelpers && measures.map((m) => (
        <RulerLine key={m.userId} measure={m} gridSize={gridSize} />
      ))}
    </Layer>
  );
}
