import { Layer, Group, Image as KonvaImage, Rect, Text } from 'react-konva';
import type Konva from 'konva';
import type { Role, TokenPublicDTO } from '@vtt/shared';
import { useAppDispatch, useAppSelector } from '../../../store';
import { moveTokenOptimistic, applyTokenRollback } from '../../../store/scene';
import { emitTokenMove } from '../../../api/socket';
import { useImage } from '../useImage';

interface TokenLayerProps {
  sceneId: string;
  tokens: TokenPublicDTO[];
  gridSize: number;
  myRole: Role;
}

/**
 * Middle layer (Ф3.1, Ф3.2). Renders all RBAC-projected tokens received from
 * the server (algorithm A6 already filtered hidden ones upstream).
 *
 * Drag policy: only GM may drag any token. Player drag of own tokens (Ф3.2.2)
 * is blocked here — `TokenPublicDTO` does not yet expose `assignedPlayerId`
 * so the client cannot make that decision; tracked as roadmap item along with
 * the necessary server change to `@vtt/shared`.
 */
export default function TokenLayer({
  sceneId,
  tokens,
  gridSize,
  myRole,
}: TokenLayerProps): JSX.Element {
  return (
    <Layer>
      {tokens.map((token) => (
        <TokenNode
          key={token.id}
          token={token}
          sceneId={sceneId}
          gridSize={gridSize}
          draggable={myRole === 'GM'}
        />
      ))}
    </Layer>
  );
}

interface TokenNodeProps {
  token: TokenPublicDTO;
  sceneId: string;
  gridSize: number;
  draggable: boolean;
}

function TokenNode({ token, sceneId, gridSize, draggable }: TokenNodeProps): JSX.Element {
  const dispatch = useAppDispatch();
  const sceneVersion = useAppSelector((s) => s.scene.version);
  const image = useImage(token.imageUrl);

  const px = token.x * gridSize;
  const py = token.y * gridSize;

  function snap(value: number, max: number): number {
    const cell = Math.round(value / gridSize);
    if (cell < 0) return 0;
    if (cell > max) return max;
    return cell;
  }

  function handleDragEnd(e: Konva.KonvaEventObject<DragEvent>): void {
    const node = e.target;
    const targetCellX = snap(node.x(), Number.MAX_SAFE_INTEGER);
    const targetCellY = snap(node.y(), Number.MAX_SAFE_INTEGER);
    // Snap visually — A2 still arbitrates authoritatively below.
    node.position({ x: targetCellX * gridSize, y: targetCellY * gridSize });

    const previousX = token.x;
    const previousY = token.y;
    dispatch(moveTokenOptimistic({ tokenId: token.id, x: targetCellX, y: targetCellY }));

    void emitTokenMove({
      tokenId: token.id,
      sceneId,
      x: targetCellX,
      y: targetCellY,
      clientSeq: sceneVersion,
    }).catch(() => {
      // Network or ack-timeout failure: revert to the pre-drag position so
      // the user is not stuck looking at a position the server never saw.
      dispatch(
        applyTokenRollback({
          tokenId: token.id,
          x: previousX,
          y: previousY,
          version: token.version,
        }),
      );
    });
  }

  return (
    <Group
      x={px}
      y={py}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      listening={true}
    >
      {image ? (
        <KonvaImage image={image} width={gridSize} height={gridSize} />
      ) : (
        <Rect
          width={gridSize}
          height={gridSize}
          fill="#7c5cff"
          stroke="#fff"
          strokeWidth={2}
          cornerRadius={4}
        />
      )}
      <Text
        text={token.name}
        x={0}
        y={gridSize}
        width={gridSize}
        align="center"
        fill="#f5f5f7"
        fontSize={11}
      />
      {token.hp !== undefined && (
        <Text
          text={`HP ${token.hp}`}
          x={0}
          y={-14}
          width={gridSize}
          align="center"
          fill="#ff6b6b"
          fontSize={11}
        />
      )}
    </Group>
  );
}
