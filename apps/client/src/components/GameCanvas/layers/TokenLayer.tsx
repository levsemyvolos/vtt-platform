import { useState } from 'react';
import { Layer, Group, Image as KonvaImage, Rect, Text, Circle } from 'react-konva';
import type Konva from 'konva';
import type { Role, TokenPublicDTO, StatusMarker } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../../store';
import { moveTokenOptimistic, applyTokenRollback } from '../../../store/scene';
import { emitTokenMove } from '../../../api/socket';
import { useImage } from '../useImage';
import HpBar from '../HpBar';
import TokenEditModal from '../../Token/TokenEditModal';
import TokenContextMenu from '../../Token/TokenContextMenu';

interface TokenLayerProps {
  sceneId: string;
  tokens: TokenPublicDTO[];
  gridSize: number;
  myRole: Role;
  myUserId: string;
  /** When provided, token left-click calls this instead of opening TokenEditModal. */
  onTokenSelect?: (tokenId: string) => void;
}

const STATUS_COLORS: Record<StatusMarker, string> = {
  poisoned: '#51cf66', stunned: '#339af0', prone: '#868e96',
  blinded: '#212529', charmed: '#f783ac', frightened: '#ff6b6b',
  grappled: '#f76707', incapacitated: '#e9ecef', paralyzed: '#74c0fc',
  petrified: '#adb5bd', restrained: '#fd7e14', unconscious: '#495057',
};

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
  sceneId, tokens, gridSize, myRole, myUserId, onTokenSelect,
}: TokenLayerProps): JSX.Element {
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [editTokenId, setEditTokenId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ tokenId: string; x: number; y: number } | null>(null);

  const handleEditClick = onTokenSelect ?? (myRole === 'GM' ? setEditTokenId : undefined);

  return (
    <>
      <Layer>
        {ghost && (
          <Rect
            key="drag-ghost"
            x={ghost.x} y={ghost.y}
            width={gridSize} height={gridSize}
            fill="#ffffff" opacity={0.25} cornerRadius={4} listening={false}
          />
        )}
        {tokens.map((token) => (
          <TokenNode
            key={token.id}
            token={token}
            sceneId={sceneId}
            gridSize={gridSize}
            draggable={myRole === 'GM' || token.assignedUserId === myUserId}
            onGhostMove={setGhost}
            onGhostEnd={() => setGhost(null)}
            onEditClick={handleEditClick}
            onContextMenu={
              myRole === 'GM' && !onTokenSelect
                ? (id, x, y) => setCtxMenu({ tokenId: id, x, y })
                : undefined
            }
          />
        ))}
      </Layer>
      {editTokenId && (
        <TokenEditModal tokenId={editTokenId} onClose={() => setEditTokenId(null)} />
      )}
      {ctxMenu && (
        <TokenContextMenu
          tokenId={ctxMenu.tokenId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onEdit={() => setEditTokenId(ctxMenu.tokenId)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}

interface TokenNodeProps {
  token: TokenPublicDTO;
  sceneId: string;
  gridSize: number;
  draggable: boolean;
  onGhostMove: (pos: { x: number; y: number }) => void;
  onGhostEnd: () => void;
  onEditClick: ((id: string) => void) | undefined;
  onContextMenu: ((id: string, x: number, y: number) => void) | undefined;
}

function TokenNode({
  token, sceneId, gridSize, draggable,
  onGhostMove, onGhostEnd, onEditClick, onContextMenu,
}: TokenNodeProps): JSX.Element {
  const dispatch = useAppDispatch();
  const sceneVersion = useAppSelector((s) => s.scene.version);
  const image = useImage(token.imageUrl);
  const tokenColor = token.color ?? '#7c5cff';

  const px = token.x;
  const py = token.y;

  function handleDragMove(e: Konva.KonvaEventObject<DragEvent>): void {
    const node = e.target;
    onGhostMove({ x: node.x(), y: node.y() });
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
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
      clientSeq: sceneVersion,
    }).catch(() => {
      dispatch(applyTokenRollback({
        tokenId: token.id, x: previousX, y: previousY, version: token.version,
      }));
    });
  }

  const markers = (token.statusMarkers ?? []) as StatusMarker[];

  return (
    <Group
      x={px} y={py}
      draggable={draggable}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={() => onEditClick?.(token.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault();
        const stage = e.target.getStage();
        const pos = stage?.getPointerPosition();
        if (pos) onContextMenu?.(token.id, pos.x, pos.y);
      }}
      listening={true}
    >
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
      {markers.length > 0 && (
        <Group y={gridSize - 10}>
          {markers.slice(0, 8).map((m, i) => (
            <Circle
              key={m}
              x={i * 10 + 5} y={5}
              radius={4}
              fill={STATUS_COLORS[m]}
              stroke="#000" strokeWidth={0.5}
            />
          ))}
        </Group>
      )}
    </Group>
  );
}
