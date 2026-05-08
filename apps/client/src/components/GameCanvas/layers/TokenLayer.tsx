import { useRef, useState } from 'react';
import { Layer, Group, Image as KonvaImage, Rect, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import type { Role, TokenPublicDTO, StatusMarker } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../../store';
import { moveTokenOptimistic, applyTokenRollback } from '../../../store/scene';
import { emitTokenMove, emitTokenDragPreview } from '../../../api/socket';
import { useImage } from '../useImage';
import HpBar from '../HpBar';

/** Throttle for `token:drag-preview` broadcasts (Sess 5.5 Mini-D). */
const TOKEN_DRAG_PREVIEW_THROTTLE_MS = 50;

interface TokenLayerProps {
  sceneId: string;
  /** Required for `token:drag-preview` broadcast (Sess 5.5 Mini-D). */
  roomId: string;
  tokens: TokenPublicDTO[];
  gridSize: number;
  myRole: Role;
  myUserId: string;
  /** Called on token left-click. Parent owns the modal/menu (must live outside <Stage>). */
  onTokenSelect?: ((tokenId: string) => void) | undefined;
  /** Called on token right-click with viewport coords. GM-only when set. */
  onTokenContextMenu?: ((tokenId: string, x: number, y: number) => void) | undefined;
}

const STATUS_COLORS: Record<StatusMarker, string> = {
  blinded: '#212529', charmed: '#f783ac', deafened: '#9775fa', frightened: '#ff6b6b',
  grappled: '#f76707', incapacitated: '#e9ecef', invisible: '#dee2e6', paralyzed: '#74c0fc',
  petrified: '#adb5bd', poisoned: '#51cf66', prone: '#868e96',
  restrained: '#fd7e14', stunned: '#339af0', unconscious: '#495057',
};

/** Status marker dots rendered below the token. Extracted to keep TokenNode
 *  cyclomatic complexity ≤ 10 (lint gate). Returns null when no markers set. */
function TokenMarkers({ markers, gridSize }: { markers: StatusMarker[]; gridSize: number }): JSX.Element | null {
  if (markers.length === 0) return null;
  return (
    <Group y={gridSize - 10}>
      {markers.slice(0, 8).map((m, i) => (
        <Circle key={m} x={i * 10 + 5} y={5} radius={4}
          fill={STATUS_COLORS[m]} stroke="#000" strokeWidth={0.5}
        />
      ))}
    </Group>
  );
}

/** Decorative highlight rect drawn when token is hovered in initiative tracker. Extracted
 *  to keep TokenNode cyclomatic complexity ≤ 10 (lint gate). Rendered as outer ring (inset -5)
 *  so it remains visible alongside the yellow active highlight (inset -3). */
function HoverHighlight({ gridSize }: { gridSize: number }): JSX.Element {
  return (
    <Rect
      x={-5}
      y={-5}
      width={gridSize + 10}
      height={gridSize + 10}
      fill="transparent"
      stroke="#3b82f6"
      strokeWidth={2}
      cornerRadius={8}
      opacity={0.7}
      listening={false}
    />
  );
}

/** Decorative highlight rect drawn behind the active-initiative token. Extracted
 *  to keep TokenNode cyclomatic complexity ≤ 10 (lint gate). */
function ActiveHighlight({ gridSize }: { gridSize: number }): JSX.Element {
  return (
    <Rect
      x={-3} y={-3}
      width={gridSize + 6} height={gridSize + 6}
      fill="transparent"
      stroke="#ffd43b" strokeWidth={3} cornerRadius={6}
      shadowBlur={12} shadowColor="#ffd43b" shadowOpacity={0.8}
      listening={false}
    />
  );
}

/** Renders hover and active highlights conditionally. Extracted to keep TokenNode
 *  cyclomatic complexity ≤ 10 (lint gate). */
function TokenHighlights({
  isHovered, isActive, isDragging, gridSize,
}: {
  isHovered: boolean; isActive: boolean; isDragging: boolean; gridSize: number;
}): JSX.Element {
  return (
    <>
      {isHovered && !isDragging && <HoverHighlight gridSize={gridSize} />}
      {isActive && !isDragging && <ActiveHighlight gridSize={gridSize} />}
    </>
  );
}

/**
 * Middle layer (Ф3.1, Ф3.2). Renders all RBAC-projected tokens received from
 * the server (algorithm A6 already filtered hidden ones upstream).
 *
 * Drag policy (Ф3.2.2): GM may drag any token; Player may drag only their
 * own token (determined by `assignedUserId === myUserId`).
 *
 * Context menu and edit modal are GM-only (rendered outside <Layer> to avoid
 * DOM-inside-Konva constraint).
 */
export default function TokenLayer({
  sceneId, roomId, tokens, gridSize, myRole, myUserId, onTokenSelect, onTokenContextMenu,
}: TokenLayerProps): JSX.Element {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  // Sess 5.5 Mini-D — remote drag previews broadcast by other clients.
  // The local dragger does NOT receive its own preview (server uses
  // socket.broadcast.to), so this map only contains tokens being moved by
  // someone else.
  const remotePreviews = useAppSelector((s) => s.annotations.tokenDragPreviews);

  const activeTokenId = useAppSelector((s) => {
    const active = s.initiative.entries.find((e) => e.isCurrent);
    return active?.tokenId ?? null;
  });

  const hoveredTokenId = useAppSelector((s) => {
    const id = s.initiativeUi.hoveredEntryId;
    if (!id) return null;
    const entry = s.initiative.entries.find((e) => e.id === id);
    return entry?.tokenId ?? null;
  });

  return (
    <Layer>
      {ghost && (
        <Rect
          key="drag-ghost"
          x={ghost.x} y={ghost.y}
          width={gridSize} height={gridSize}
          fill="#ffffff" opacity={0.25} cornerRadius={4} listening={false}
        />
      )}
      {tokens.map((token) => {
        const preview = remotePreviews[token.id];
        return (
          <TokenNode
            key={token.id}
            token={token}
            sceneId={sceneId}
            roomId={roomId}
            gridSize={gridSize}
            draggable={myRole === 'GM' || token.assignedUserId === myUserId}
            remotePreview={preview ?? null}
            isActive={activeTokenId !== null && activeTokenId === token.id}
            isHovered={hoveredTokenId !== null && hoveredTokenId === token.id}
            onGhostMove={setGhost}
            onGhostEnd={() => setGhost(null)}
            onEditClick={onTokenSelect}
            onContextMenu={onTokenContextMenu}
          />
        );
      })}
    </Layer>
  );
}

interface TokenNodeProps {
  token: TokenPublicDTO;
  sceneId: string;
  roomId: string;
  gridSize: number;
  draggable: boolean;
  /** Remote drag-preview position (Sess 5.5 Mini-D); overrides token.x/y for non-draggers. */
  remotePreview: { x: number; y: number } | null;
  /** True when this token is the current initiative turn's active token. */
  isActive: boolean;
  /** True when this token is hovered in the initiative tracker. */
  isHovered: boolean;
  onGhostMove: (pos: { x: number; y: number }) => void;
  onGhostEnd: () => void;
  onEditClick: ((id: string) => void) | undefined;
  onContextMenu: ((id: string, x: number, y: number) => void) | undefined;
}

function TokenNode({
  token, sceneId, roomId, gridSize, draggable, remotePreview, isActive, isHovered,
  onGhostMove, onGhostEnd, onEditClick, onContextMenu,
}: TokenNodeProps): JSX.Element {
  const dispatch = useAppDispatch();
  const image = useImage(token.imageUrl);
  const tokenColor = token.color ?? '#7c5cff';

  // Track local drag state so remotePreview never overrides our own Konva-driven
  // position (the server doesn't echo our preview back, but the guard adds safety
  // against any future change that might).
  const isDraggingLocallyRef = useRef(false);
  const lastPreviewEmitRef = useRef(0);

  const usePreview = remotePreview !== null && !isDraggingLocallyRef.current;
  const px = usePreview ? remotePreview.x : token.x;
  const py = usePreview ? remotePreview.y : token.y;

  function handleDragStart(): void {
    isDraggingLocallyRef.current = true;
  }

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
    const node = e.target;
    const x = node.x();
    const y = node.y();
    onGhostMove({ x, y });

    // Sess 5.5 Mini-D — throttled ephemeral broadcast for smooth remote view.
    const now = Date.now();
    if (now - lastPreviewEmitRef.current >= TOKEN_DRAG_PREVIEW_THROTTLE_MS) {
      lastPreviewEmitRef.current = now;
      emitTokenDragPreview({ roomId, sceneId, tokenId: token.id, x, y });
    }
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    isDraggingLocallyRef.current = false;
    onGhostEnd();
    const node = e.target;
    const targetX = Math.max(0, node.x());
    const targetY = Math.max(0, node.y());
    node.position({ x: targetX, y: targetY });

    const previousX = token.x;
    const previousY = token.y;
    dispatch(moveTokenOptimistic({ tokenId: token.id, x: targetX, y: targetY }));

    void emitTokenMove({
      tokenId: token.id,
      sceneId,
      x: targetX,
      y: targetY,
      clientSeq: token.version,
    }).catch(() => {
      dispatch(applyTokenRollback({
        tokenId: token.id, x: previousX, y: previousY, version: token.version,
      }));
    });
  }

  const markers = (token.statusMarkers ?? []) as StatusMarker[];

  function handleClick(e: Konva.KonvaEventObject<MouseEvent>): void {
    if (e.evt.button !== 0) return;
    onEditClick?.(token.id);
  }

  function handleContextMenu(e: Konva.KonvaEventObject<MouseEvent>): void {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (pos) onContextMenu?.(token.id, pos.x, pos.y);
  }

  return (
    <Group
      x={px} y={py}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      listening={true}
    >
      <TokenHighlights isHovered={isHovered} isActive={isActive} isDragging={isDraggingLocallyRef.current} gridSize={gridSize} />
      {image ? (
        <KonvaImage image={image} width={gridSize} height={gridSize} />
      ) : (
        <Rect
          width={gridSize} height={gridSize}
          fill={tokenColor} stroke="#fff" strokeWidth={2} cornerRadius={4}
        />
      )}
      <Text
        text={token.name} x={0} y={gridSize}
        width={gridSize} align="center" fill="#f5f5f7" fontSize={11}
      />
      {token.hp !== undefined && (
        <HpBar hp={token.hp} maxHp={token.maxHp} gridSize={gridSize} />
      )}
      <TokenMarkers markers={markers} gridSize={gridSize} />
    </Group>
  );
}
