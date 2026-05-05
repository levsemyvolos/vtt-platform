import type {
  TokenPublicDTO,
  ChatMessageDTO,
  InitiativeEntryDTO,
  SceneDTO,
  SceneAnnotations,
  SceneObject,
  ChatMode,
  DiceMode,
  FogShape,
} from '../shared/index';

// ---------- C→S payloads ----------

export interface RoomJoinPayload {
  roomId: string;
}

export interface TokenMovePayload {
  tokenId: string;
  x: number;
  y: number;
  sceneId: string;
  /** Last Token.version known to the client (OCC algorithm A2, §2.17). */
  clientSeq: number;
}

export interface ChatMessageInput {
  roomId: string;
  text: string;
  mode: ChatMode;
  /** Required for whisper mode; ignored otherwise. */
  recipientId?: string;
}

export interface DiceRollInput {
  roomId: string;
  expression: string;
  mode: DiceMode;
  label?: string;
}

export interface SignalingPayload {
  roomId: string;
  toUserId: string;
  /** Opaque SDP / ICE candidate. Forwarded as-is by the server. */
  data: unknown;
  /**
   * Sender's userId. Set authoritatively by the server when forwarding;
   * any value sent by the client is overwritten and must not be trusted.
   */
  fromUserId?: string;
}

// ---------- S→C payloads ----------

export interface SceneUpdatedPayload {
  sceneId: string;
  version: number;
  tokens: TokenPublicDTO[];
  /** Present when annotations changed (text/image add/delete). Absent on token-only updates. */
  annotations?: SceneAnnotations;
}

/**
 * Targeted rollback after OCC reject (clientSeq < Token.version).
 * Sent only to the requesting socket so other clients are not disturbed.
 */
export interface TokenRollbackPayload {
  tokenId: string;
  x: number;
  y: number;
  version: number;
}

export interface ChatDicePayload {
  messageId: string;
  roomId: string;
  userId: string;
  expression: string;
  mode: DiceMode;
  total: number;
  rolls: number[];
  /** When true, only `recipients` should render the message. */
  secret: boolean;
  recipients: string[];
  createdAt: string;
}

export interface SessionResyncPayload {
  scene: SceneDTO;
  messages: ChatMessageDTO[];
  initiatives: InitiativeEntryDTO[];
  serverTime: number;
}

/**
 * Fog-of-war shape ops (Ф3.3, shape-list model).
 * `add` appends, `remove` deletes by id, `clear` wipes the list.
 * Server broadcasts the same payload back to the room after persisting.
 */
export interface FogShapeAddPayload {
  roomId: string;
  sceneId: string;
  shape: FogShape;
}

export interface FogShapeRemovePayload {
  roomId: string;
  sceneId: string;
  shapeId: string;
}

/**
 * Initiative-tracker snapshot broadcast after every write op (add / remove /
 * reorder / advance). Ф7.3.
 *
 * `currentRound` is incremented when `advanceTurn` wraps past the last entry
 * back to index 0. MVP: stored in-memory inside InitiativeService — see TSDoc
 * note there.
 */
export interface InitiativeUpdatedPayload {
  sceneId: string;
  entries: InitiativeEntryDTO[];
  currentRound: number;
}

/**
 * Universal audio-control event (Ф6, table 2.14).
 *
 * Discriminated by `action`:
 *   - 'play'   — start the track from the beginning (track became current).
 *   - 'switch' — scene changed and the new scene's bound track must auto-start
 *                with fade-in (Ф6.4); semantically same as 'play' but lets
 *                clients distinguish a manual play from a scene-switch.
 *   - 'stop'   — stop the current track (no `trackId`/`sceneId` required).
 *
 * `startedAt` is the server's monotonic timestamp (ms since epoch) so late
 * joiners can sync playback offset on `session:resync`. Fade duration lives on
 * the client as a UI constant (see store/audio.ts) — it is never persisted
 * and never travels over the wire.
 */
export type AudioPlayPayload =
  | {
      action: 'play' | 'switch';
      trackId: string;
      sceneId: string | null;
      loop: boolean;
      startedAt: number;
    }
  | {
      action: 'stop';
      startedAt: number;
    };

/**
 * Persistent free-draw stroke (Ф3.4.2, table 2.14).
 * Stored in Scene.annotations JSONB; broadcast to room after server persists.
 * GM-only: handler enforces role before saving.
 */
export interface DrawStrokePayload {
  roomId: string;
  sceneId: string;
  /** Flat [x0,y0, x1,y1, ...] point array — Konva polyline format. */
  points: number[];
  color: string;
  width: number;
  userId: string;
  /** Client-generated stroke id (UUID) for idempotent upserts. */
  strokeId: string;
}

export interface SceneObjectMovePayload {
  roomId: string;
  sceneId: string;
  objectId: string;
  x: number;
  y: number;
}

export interface SceneObjectDeletePayload {
  roomId: string;
  sceneId: string;
  objectId: string;
}

/**
 * Discrete transform event — fired once on transformEnd (Sess 2).
 * Not throttled (unlike object:move) because transforms are rare user gestures.
 * x/y are included because Konva Transformer can reposition the Group during
 * corner-resize and rotation, causing Player-side desync if omitted (Sess 2.5).
 */
export interface SceneObjectTransformPayload {
  roomId: string;
  sceneId: string;
  objectId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Normalized rotation in degrees [0, 360). */
  rotation: number;
}

export interface SceneObjectUpsertPayload {
  roomId: string;
  sceneId: string;
  object: SceneObject;
}

/**
 * Toggles the locked flag on a SceneObject (Sess 3).
 * Locked objects render but ignore drag/transform until unlocked.
 */
export interface SceneObjectLockPayload {
  roomId: string;
  sceneId: string;
  objectId: string;
  locked: boolean;
}

/**
 * Changes the zIndex of a SceneObject (Sess 3).
 * direction='front' sends to front (max+1), 'back' to back (min-1).
 * Server normalizes the new value relative to peers.
 */
export interface SceneObjectZOrderPayload {
  roomId: string;
  sceneId: string;
  objectId: string;
  direction: 'front' | 'back';
}

/**
 * Creates a deep copy of a SceneObject offset by (+20, +20) (Sess 3).
 * Server returns the new object via room broadcast (`object:duplicated`).
 */
export interface SceneObjectDuplicatePayload {
  roomId: string;
  sceneId: string;
  objectId: string;
}

/**
 * Server response for object:duplicate — broadcasts the full new object
 * so clients can append it to local state without a re-fetch.
 */
export interface SceneObjectDuplicatedPayload {
  roomId: string;
  sceneId: string;
  /** Full new SceneObject with new id. */
  object: SceneObject;
}

/**
 * Ephemeral ruler broadcast (Ф3.4.3, table 2.14).
 * Never persisted — server forwards to room; client auto-fades 5 s after last update.
 */
export interface MeasurePayload {
  roomId: string;
  sceneId: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  userId: string;
}

/**
 * Ephemeral attention-marker broadcast (Ф3.4.1, table 2.14 row 13).
 * Never persisted — server forwards to room and the client auto-fades in 3 s.
 */
export interface AnnotationPingPayload {
  roomId: string;
  sceneId: string;
  x: number;
  y: number;
  color: string;
  userId: string;
  timestamp: number;
}

// ---------- ACK envelope ----------

/**
 * socket.io callback ack contract (§2.16.5).
 * Producers return `{ ok: true, ... }` or `{ ok: false, error: { code, message } }`.
 */
export type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: number; message: string } };

// ---------- OCC discriminated union (algorithm A2) ----------

export type OccResult<TRawToken = unknown> =
  | { kind: 'accepted'; sceneUpdate: SceneUpdatedPayload; rawTokens?: TRawToken[] }
  | { kind: 'rollback'; rollback: TokenRollbackPayload }
  | { kind: 'discarded'; reason: string };

// ---------- Visibility matrix (algorithm A4) ----------

export type VisibilityMatrix = boolean[][];

// ---------- socket.io v4 typed event maps (§2.16.3, table 2.14) ----------

/**
 * Full scene flush payload — sent once by GM on Done (Edit Scene).
 * Server saves fog+annotations and broadcasts to others only (sender keeps local state).
 */
export interface SceneFlushPayload {
  roomId: string;
  sceneId: string;
  shapes: FogShape[];
  annotations: SceneAnnotations;
}

export interface ClientToServerEvents {
  'room:join': (payload: RoomJoinPayload, ack: (response: Ack<{ joined: true }>) => void) => void;
  'token:move': (
    payload: TokenMovePayload,
    ack: (response: Ack<{ accepted: boolean; version: number }>) => void,
  ) => void;
  'chat:message': (
    payload: ChatMessageInput,
    ack: (response: Ack<ChatMessageDTO>) => void,
  ) => void;
  'dice:roll': (payload: DiceRollInput, ack: (response: Ack<ChatDicePayload>) => void) => void;
  'session:resync': (
    payload: { roomId: string },
    ack: (response: Ack<SessionResyncPayload>) => void,
  ) => void;
  'signal:offer': (payload: SignalingPayload) => void;
  'signal:answer': (payload: SignalingPayload) => void;
  'signal:ice': (payload: SignalingPayload) => void;
  'cursor:ping': (payload: AnnotationPingPayload) => void;
  'measure:start': (payload: MeasurePayload) => void;
  'draw:stroke': (payload: DrawStrokePayload) => void;
  'draw:clear': (payload: { roomId: string; sceneId: string }) => void;
  'fog:shape-add': (payload: FogShapeAddPayload) => void;
  'fog:shape-remove': (payload: FogShapeRemovePayload) => void;
  'fog:clear': (payload: { roomId: string; sceneId: string }) => void;
  'object:move': (payload: SceneObjectMovePayload) => void;
  'object:delete': (payload: SceneObjectDeletePayload) => void;
  'object:transform': (payload: SceneObjectTransformPayload) => void;
  'object:lock': (payload: SceneObjectLockPayload) => void;
  'object:zorder': (payload: SceneObjectZOrderPayload) => void;
  'object:duplicate': (payload: SceneObjectDuplicatePayload) => void;
  'scene:flush': (payload: SceneFlushPayload) => void;
  'mod:kick': (payload: ModerationPayload, ack: (response: Ack<{ ok: boolean }>) => void) => void;
  'mod:demote': (payload: ModerationPayload, ack: (response: Ack<{ ok: boolean }>) => void) => void;
  'mod:server-mute': (payload: ModerationPayload) => void;
  'mod:force-cam-off': (payload: ModerationPayload) => void;
}

export interface MemberJoinedPayload {
  roomId: string;
  member: import('../rest/index').RoomMemberDTO;
}

export interface RoomDeletedPayload {
  roomId: string;
  reason?: string;
}

export interface RoomStartedPayload {
  roomId: string;
}

export interface RoomUpdatedPayload {
  roomId: string;
  name: string;
  gameSystem: string;
}

export interface AnnotationsUpdatedPayload {
  sceneId: string;
  annotations: SceneAnnotations;
}

export interface SceneSnapshotPayload {
  scene: SceneDTO;
}

export interface ServerToClientEvents {
  'room:member-joined': (payload: MemberJoinedPayload) => void;
  'room:deleted': (payload: RoomDeletedPayload) => void;
  'room:started': (payload: RoomStartedPayload) => void;
  'room:updated': (payload: RoomUpdatedPayload) => void;
  'scene:updated': (payload: SceneUpdatedPayload) => void;
  'annotations:updated': (payload: AnnotationsUpdatedPayload) => void;
  'token:rollback': (payload: TokenRollbackPayload) => void;
  'chat:dice': (payload: ChatDicePayload) => void;
  'chat:message': (payload: ChatMessageDTO) => void;
  'initiative:updated': (payload: InitiativeUpdatedPayload) => void;
  'session:resync': (payload: SessionResyncPayload) => void;
  'fog:shape-add': (payload: FogShapeAddPayload) => void;
  'fog:shape-remove': (payload: FogShapeRemovePayload) => void;
  'fog:clear': (payload: { roomId: string; sceneId: string }) => void;
  'audio:play': (payload: AudioPlayPayload) => void;
  'signal:offer': (payload: SignalingPayload) => void;
  'signal:answer': (payload: SignalingPayload) => void;
  'signal:ice': (payload: SignalingPayload) => void;
  'cursor:ping': (payload: AnnotationPingPayload) => void;
  'measure:start': (payload: MeasurePayload) => void;
  'draw:stroke': (payload: DrawStrokePayload) => void;
  'draw:clear': (payload: { roomId: string; sceneId: string }) => void;
  'scene:activated': (payload: { sceneId: string; roomId: string }) => void;
  'object:move': (payload: SceneObjectMovePayload) => void;
  'object:delete': (payload: SceneObjectDeletePayload) => void;
  'object:transform': (payload: SceneObjectTransformPayload) => void;
  'object:lock': (payload: SceneObjectLockPayload) => void;
  'object:zorder': (payload: SceneObjectZOrderPayload) => void;
  'object:duplicated': (payload: SceneObjectDuplicatedPayload) => void;
  'peer:mute-request': (payload: { userId: string }) => void;
  'peer:cam-off-request': (payload: { userId: string }) => void;
  'room:member-removed': (payload: { roomId: string; userId: string }) => void;
  'room:member-updated': (payload: { roomId: string; member: import('../rest/index').RoomMemberDTO }) => void;
  /** Sent only to the kicked user's sockets after `mod:kick`; client redirects out. */
  'room:kicked': (payload: { roomId: string }) => void;
  /** Full scene snapshot broadcast — used for background/grid changes and scene:flush delivery. */
  'scene:snapshot': (payload: SceneSnapshotPayload) => void;
}

export interface ModerationPayload {
  roomId: string;
  targetUserId: string;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  role: import('../shared/index').Role;
  roomId?: string;
  boundRoomId?: string;
  sessionId: string;
}
