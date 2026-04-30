import type {
  TokenPublicDTO,
  ChatMessageDTO,
  InitiativeEntryDTO,
  SceneDTO,
  ChatMode,
  DiceMode,
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

export interface FogMaskDiffPayload {
  sceneId: string;
  /** Base64-packed XOR diff — applied bitwise to the previous mask on the client. */
  diffBase64: string;
  width: number;
  height: number;
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

export type OccResult =
  | { kind: 'accepted'; sceneUpdate: SceneUpdatedPayload }
  | { kind: 'rollback'; rollback: TokenRollbackPayload }
  | { kind: 'discarded'; reason: string };

// ---------- Visibility matrix (algorithm A4) ----------

export type VisibilityMatrix = boolean[][];

// ---------- socket.io v4 typed event maps (§2.16.3, table 2.14) ----------

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
  'annotation:ping': (payload: AnnotationPingPayload) => void;
}

export interface ServerToClientEvents {
  'scene:updated': (payload: SceneUpdatedPayload) => void;
  'token:rollback': (payload: TokenRollbackPayload) => void;
  'chat:dice': (payload: ChatDicePayload) => void;
  'chat:message': (payload: ChatMessageDTO) => void;
  'initiative:updated': (payload: InitiativeUpdatedPayload) => void;
  'session:resync': (payload: SessionResyncPayload) => void;
  'fog:mask-diff': (payload: FogMaskDiffPayload) => void;
  'audio:play': (payload: AudioPlayPayload) => void;
  'signal:offer': (payload: SignalingPayload) => void;
  'signal:answer': (payload: SignalingPayload) => void;
  'signal:ice': (payload: SignalingPayload) => void;
  'annotation:ping': (payload: AnnotationPingPayload) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  role: import('../shared/index').Role;
  roomId?: string;
  sessionId: string;
}
