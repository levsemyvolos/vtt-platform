import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useAppDispatch, useAppSelector, store } from '../../../store';
import { moveSceneObjectOptimistic, selectSceneObject, transformSceneObjectOptimistic } from '../../../store/scene';
import { recordUndo } from '../../../store/undoDispatcher';
import type { ObjectTransformSnapshot } from '../../../store/undoHistory';
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
  const { t } = useTranslation('gameroom');
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
        text={`${distUnits} ${t('units.cells')}`}
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
    // Sess 9.1 — hitStrokeWidth is widened to >= 12 px so thin strokes are
    // still hoverable by the eraser tool. Visual stroke width unchanged.
    return (
      <Line
        points={object.points}
        stroke={object.color}
        strokeWidth={object.strokeWidth}
        hitStrokeWidth={Math.max(object.strokeWidth, 12)}
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
  // Sess 9.3 — memoized so the O(n) min/max scan over points runs only when
  // points actually change, not on every parent re-render (selection ticks etc.).
  const strokePoints = object.type === 'stroke' ? object.points : undefined;
  const dragPivot = useMemo(
    () => (strokePoints ? computeStrokePivot(strokePoints) : { x: 0, y: 0 }),
    [strokePoints],
  );

  // Sess 7.5: capture the pre-drag position the first time broadcastMove fires
  // for this drag gesture, so we can record an undo entry on dragEnd.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  // Sess 10.3: when the dragged object is part of a multi-select, snapshot all
  // selected objects' starting positions and apply the same delta to others.
  const multiDragSnapshotRef = useRef<Map<string, { x: number; y: number }> | null>(null);

  function captureMultiDragSnapshot(ids: string[]): void {
    if (multiDragSnapshotRef.current !== null) return;
    multiDragSnapshotRef.current = new Map();
    const objs = store.getState().scene.current?.annotations.objects ?? [];
    for (const id of ids) {
      const o = objs.find((ob) => ob.id === id);
      if (o && o.locked !== true) multiDragSnapshotRef.current.set(id, { x: o.x, y: o.y });
    }
  }

  function applyMultiDragDelta(x: number, y: number): void {
    const ids = store.getState().scene.selectedSceneObjectIds;
    if (ids.length <= 1 || !ids.includes(object.id)) return;
    captureMultiDragSnapshot(ids);
    const myStart = multiDragSnapshotRef.current?.get(object.id);
    if (!myStart || !multiDragSnapshotRef.current) return;
    const dx = x - myStart.x;
    const dy = y - myStart.y;
    for (const [otherId, start] of multiDragSnapshotRef.current.entries()) {
      if (otherId === object.id) continue;
      const ox = start.x + dx;
      const oy = start.y + dy;
      dispatch(moveSceneObjectOptimistic({ objectId: otherId, x: ox, y: oy }));
      emitObjectMove({ roomId, sceneId, objectId: otherId, x: ox, y: oy });
    }
  }

  function recordDragUndoOnEnd(start: { x: number; y: number }, x: number, y: number): void {
    const snap = multiDragSnapshotRef.current;
    multiDragSnapshotRef.current = null;
    if (snap && snap.size > 1) {
      // Multi-move: collect before from snapshot, after from current state.
      const before = [...snap.entries()].map(([id, p]) => ({ id, x: p.x, y: p.y }));
      const objs = store.getState().scene.current?.annotations.objects ?? [];
      const after = before.map(({ id }) => {
        const o = objs.find((ob) => ob.id === id);
        return { id, x: o?.x ?? 0, y: o?.y ?? 0 };
      });
      recordUndo({ kind: 'object_multi_move', before, after });
      return;
    }
    // Single-move (existing): skip if the gesture didn't actually move the object.
    if (Math.abs(start.x - x) > 0.5 || Math.abs(start.y - y) > 0.5) {
      recordUndo({
        kind: 'object_move',
        before: { id: object.id, x: start.x, y: start.y },
        after: { id: object.id, x, y },
      });
    }
  }

  function broadcastMove(x: number, y: number, force = false): void {
    const now = Date.now();
    if (!force && now - lastMoveAt.current < OBJECT_MOVE_THROTTLE_MS) return;
    lastMoveAt.current = now;
    if (dragStartRef.current === null) dragStartRef.current = { x: object.x, y: object.y };
    dispatch(moveSceneObjectOptimistic({ objectId: object.id, x, y }));
    emitObjectMove({ roomId, sceneId, objectId: object.id, x, y });
    applyMultiDragDelta(x, y);
    if (force) {
      const start = dragStartRef.current;
      dragStartRef.current = null;
      recordDragUndoOnEnd(start, x, y);
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

/** Sess 10.4 fix — visual center of a rect (image/text bbox) at (x, y) sized
 *  (w, h) and rotated by `rotationDeg` around its local origin (0, 0).
 *  Konva applies rotation BEFORE translation, so the rect's local center
 *  (w/2, h/2) ends up at world (x + halfW*cos − halfH*sin, y + halfW*sin + halfH*cos).
 *  The previous Shift+rotate math used the un-rotated formula (x + w/2, y + h/2)
 *  and was off by the rotation delta — visible as objects "drifting" during
 *  multi-select Shift+rotate. */
function rotatedRectCenter(
  x: number, y: number, w: number, h: number, rotationDeg: number,
): { x: number; y: number } {
  const r = (rotationDeg * Math.PI) / 180;
  const halfW = w / 2;
  const halfH = h / 2;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: x + halfW * cos - halfH * sin,
    y: y + halfW * sin + halfH * cos,
  };
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

  // Sess 10 — Transformer attaches to ALL selected, non-locked SceneObjects in
  // THIS layer (single OR multi). Konva renders one bounding-box around the
  // group; per-node transform values are committed independently in
  // handleTransformEnd (and commitMulti below).
  const selectedObjects = useMemo(
    () => sceneObjects.filter((o) => selectedIds.includes(o.id) && o.locked !== true),
    [sceneObjects, selectedIds],
  );
  const showTransformer = myRole === 'GM' && selectedObjects.length > 0;
  // Stable string of ids in selection order — used as a dep to re-attach
  // Transformer when the set changes (avoids re-running on every state mutation).
  const selectedIdsKey = selectedObjects.map((o) => o.id).join(',');

  // Wire Transformer to all selected Konva nodes by ID.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    if (!showTransformer) {
      tr.nodes([]);
      return;
    }
    const stage = tr.getStage();
    if (!stage) { tr.nodes([]); return; }
    const ids = selectedIdsKey ? selectedIdsKey.split(',') : [];
    const nodes = ids
      .map((id) => stage.findOne(`#${id}`))
      .filter((n): n is Konva.Node => Boolean(n));
    tr.nodes(nodes);
    tr.getLayer()?.batchDraw();
  }, [selectedIdsKey, showTransformer]);

  // Sess 10.4 — keyboard modifiers split into β-semantics:
  //   Shift = keepRatio + centeredScaling (single: scales around own center;
  //           multi: per-object center-preservation handled in commit)
  //   Alt   = rotation snaps to 15° increments (was on Shift in Sess 2)
  //   Ctrl  = grid-snap for image bbox (unchanged)
  // shiftHeldRef is used by the multi-commit path to know whether to apply
  // per-object center-preservation when Konva scales the whole group.
  const shiftHeldRef = useRef(false);
  useEffect(() => {
    if (myRole !== 'GM') return;

    const ROTATION_SNAPS = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165,
      180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];

    function handleKeyDown(e: KeyboardEvent): void {
      const tr = trRef.current;
      if (e.key === 'Shift') {
        shiftHeldRef.current = true;
        if (tr) {
          tr.keepRatio(true);
          tr.centeredScaling(true);
          tr.getLayer()?.batchDraw();
        }
      }
      if (e.key === 'Alt' && tr) {
        tr.rotationSnaps(ROTATION_SNAPS);
        tr.getLayer()?.batchDraw();
      }
      if (e.key === 'Control') ctrlSnapRef.current = true;
    }

    function handleKeyUp(e: KeyboardEvent): void {
      const tr = trRef.current;
      if (e.key === 'Shift') {
        shiftHeldRef.current = false;
        if (tr) {
          tr.keepRatio(false);
          tr.centeredScaling(false);
          tr.getLayer()?.batchDraw();
        }
      }
      if (e.key === 'Alt' && tr) {
        tr.rotationSnaps([]);
        tr.getLayer()?.batchDraw();
      }
      if (e.key === 'Control') ctrlSnapRef.current = false;
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [myRole]);

  // Sess 10.2 fix — handleTransformEnd may fire once per Transformer gesture OR
  // once per attached node depending on Konva's binding. Either way we want to
  // process ALL attached nodes exactly once per gesture: the lock-ref guarantees
  // we run only on the first fire; tr.nodes() iteration guarantees every node
  // is committed even if no further events come.
  const transformLockRef = useRef(false);

  /** Commits a single node based on its SceneObject type. Returns the
   *  before/after snapshot for undo, or null if the node doesn't match a
   *  selected object (defensive — shouldn't happen normally). */
  function commitNodeTransform(
    node: Konva.Group,
    shiftCenter: boolean,
  ): { before: ObjectTransformSnapshot; after: ObjectTransformSnapshot } | null {
    const obj = selectedObjects.find((o) => o.id === node.id());
    if (!obj) return null;
    if (obj.type === 'image') return commitImageTransform(node, obj, shiftCenter);
    if (obj.type === 'text') return commitTextTransform(node, obj, shiftCenter);
    return commitStrokeTransform(node, obj);
  }

  function pushTransformBatchUndo(batch: { before: ObjectTransformSnapshot; after: ObjectTransformSnapshot }[]): void {
    if (batch.length === 1) {
      recordUndo({ kind: 'object_transform', before: batch[0]!.before, after: batch[0]!.after });
    } else if (batch.length > 1) {
      recordUndo({
        kind: 'object_multi_transform',
        before: batch.map((b) => b.before),
        after: batch.map((b) => b.after),
      });
    }
  }

  function commitAllTransforms(): void {
    const tr = trRef.current;
    if (!tr) return;
    const nodes = tr.nodes() as Konva.Group[];
    if (nodes.length === 0) return;
    const shiftCenter = shiftHeldRef.current && nodes.length > 1;
    const batch: { before: ObjectTransformSnapshot; after: ObjectTransformSnapshot }[] = [];
    for (const node of nodes) {
      const snap = commitNodeTransform(node, shiftCenter);
      if (snap) batch.push(snap);
    }
    pushTransformBatchUndo(batch);
  }

  function handleTransformEnd(): void {
    if (transformLockRef.current) return;
    transformLockRef.current = true;
    try {
      commitAllTransforms();
    } finally {
      // Release on next microtask so subsequent fires within the same gesture
      // are ignored, but the next user gesture starts fresh.
      queueMicrotask(() => { transformLockRef.current = false; });
    }
  }

  /** Image transform commit — bakes scale into width/height (Sess 2).
   *  Sess 10.4 β: when shiftCenter is true (multi+Shift), shifts node x/y so the
   *  image's center stays put after the group-anchored Konva scale. */
  function commitImageTransform(
    node: Konva.Group,
    image: SceneObject & { type: 'image' },
    shiftCenter: boolean,
  ): { before: ObjectTransformSnapshot; after: ObjectTransformSnapshot } {
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
    let newX = node.x();
    let newY = node.y();
    if (shiftCenter) {
      // Sess 10.4 fix — center math must account for rotation. The naïve
      // (x + w/2, y + h/2) is the visual center only when rotation = 0.
      const preCenter = rotatedRectCenter(
        image.x, image.y, image.width ?? 0, image.height ?? 0, image.rotation ?? 0,
      );
      const postCenter = rotatedRectCenter(newX, newY, newWidth, newHeight, newRotation);
      newX -= postCenter.x - preCenter.x;
      newY -= postCenter.y - preCenter.y;
    }

    const before: ObjectTransformSnapshot = {
      id: image.id, x: image.x, y: image.y, rotation: image.rotation ?? 0,
      width: image.width, height: image.height,
    };
    const after: ObjectTransformSnapshot = {
      id: image.id, x: newX, y: newY, rotation: newRotation,
      width: newWidth, height: newHeight,
    };
    dispatch(transformSceneObjectOptimistic({ objectId: image.id, ...after }));
    node.scaleX(1);
    node.scaleY(1);
    emitObjectTransform({ roomId, sceneId, objectId: image.id, ...after });
    return { before, after };
  }

  /** Text transform commit — scales fontSize uniformly (Sess 7, 1α). */
  function commitTextTransform(
    node: Konva.Group,
    text: SceneObject & { type: 'text' },
    shiftCenter: boolean,
  ): { before: ObjectTransformSnapshot; after: ObjectTransformSnapshot } {
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rawRot = node.rotation();
    const factor = (Math.abs(scaleX) + Math.abs(scaleY)) / 2;
    const FONT_MIN = 8;
    const FONT_MAX = 200;
    const newFontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, Math.round(text.fontSize * factor)));
    const newRotation = ((rawRot % 360) + 360) % 360;
    let newX = node.x();
    let newY = node.y();
    if (shiftCenter) {
      // Sess 10.4 fix — text bbox via selection-box helper, then rotate the
      // local center using rotatedRectCenter so the math is correct under
      // arbitrary rotation (not just 0°).
      const preBox = computeSelectionBox(text);
      const postText = { ...text, fontSize: newFontSize };
      const postBox = computeSelectionBox(postText);
      const preCenter = rotatedRectCenter(
        text.x + preBox.x, text.y + preBox.y, preBox.w, preBox.h, text.rotation ?? 0,
      );
      const postCenter = rotatedRectCenter(
        newX + postBox.x, newY + postBox.y, postBox.w, postBox.h, newRotation,
      );
      newX -= postCenter.x - preCenter.x;
      newY -= postCenter.y - preCenter.y;
    }
    const before: ObjectTransformSnapshot = {
      id: text.id, x: text.x, y: text.y, rotation: text.rotation ?? 0, fontSize: text.fontSize,
    };
    const after: ObjectTransformSnapshot = {
      id: text.id, x: newX, y: newY, rotation: newRotation, fontSize: newFontSize,
    };
    dispatch(transformSceneObjectOptimistic({ objectId: text.id, ...after }));
    node.scaleX(1);
    node.scaleY(1);
    emitObjectTransform({ roomId, sceneId, objectId: text.id, ...after });
    return { before, after };
  }

  /** Stroke transform commit — bakes the new absolute scale/rotation into
   *  SceneObject.scaleX/scaleY/rotation without modifying points[] (Sess 7, 2β).
   *  Stroke already pivots around its centroid via offset, so multi+Shift center-
   *  preservation is automatic — no shiftCenter parameter needed. */
  function commitStrokeTransform(
    node: Konva.Group,
    stroke: SceneObject & { type: 'stroke' },
  ): { before: ObjectTransformSnapshot; after: ObjectTransformSnapshot } {
    const STROKE_MIN = 0.1;
    const STROKE_MAX = 10;
    const newScaleX = Math.max(STROKE_MIN, Math.min(STROKE_MAX, node.scaleX()));
    const newScaleY = Math.max(STROKE_MIN, Math.min(STROKE_MAX, node.scaleY()));
    const newRotation = ((node.rotation() % 360) + 360) % 360;
    const pivot = computeStrokePivot(stroke.points);
    const newX = node.x() - pivot.x;
    const newY = node.y() - pivot.y;
    const before: ObjectTransformSnapshot = {
      id: stroke.id, x: stroke.x, y: stroke.y, rotation: stroke.rotation ?? 0,
      scaleX: stroke.scaleX ?? 1, scaleY: stroke.scaleY ?? 1,
    };
    const after: ObjectTransformSnapshot = {
      id: stroke.id, x: newX, y: newY, rotation: newRotation,
      scaleX: newScaleX, scaleY: newScaleY,
    };
    dispatch(transformSceneObjectOptimistic({ objectId: stroke.id, ...after }));
    emitObjectTransform({ roomId, sceneId, objectId: stroke.id, ...after });
    return { before, after };
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
            // Sess 10.7 — lock at oldBox when shrinking past minSize OR when
            // Konva proposes a flipped box (negative width/height). Earlier code
            // used Math.abs(width) and kept newBox.x/y, which decoupled the
            // bounding box from the cursor and caused the object to "teleport"
            // at ~80% shrink (the flip-inversion point). This is the standard
            // Konva-docs recommended pattern: freeze at last valid state, the
            // cursor visually detaches from the anchor but no jump occurs.
            //
            // Multi-select: only apply image-style minSize when ALL selected
            // objects are images. Otherwise fall back to 4-px minimum so
            // text/stroke don't fight the grid.
            const allImages = selectedObjects.length > 0 && selectedObjects.every((o) => o.type === 'image');
            const minSize = allImages ? gridSize : 4;
            if (Math.abs(newBox.width) < minSize || Math.abs(newBox.height) < minSize) {
              return oldBox;
            }
            if (newBox.width < 0 || newBox.height < 0) {
              return oldBox;
            }
            // Ctrl-snap (image-only selection): round dimensions to grid.
            if (allImages && ctrlSnapRef.current) {
              return {
                ...newBox,
                width: Math.max(minSize, Math.round(newBox.width / minSize) * minSize),
                height: Math.max(minSize, Math.round(newBox.height / minSize) * minSize),
              };
            }
            return newBox;
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
