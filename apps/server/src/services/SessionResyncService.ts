import type { Role, SessionResyncPayload } from '@vtt/shared';
import { HttpError } from '../lib/errors.js';
import { SceneService } from './SceneService.js';
import { InitiativeRepository } from '../repositories/InitiativeRepository.js';
import { projectInitiative, projectChatMessage } from './projections.js';
import { ChatMessageRepository } from '../repositories/ChatMessageRepository.js';
import type { RoomAudioState } from './AudioService.js';

/** Minimal interface so SessionResyncService only depends on what it needs. */
export interface AudioStateProvider {
  getCurrentForRoom(roomId: string): RoomAudioState;
}

/**
 * Algorithm A3 (§2.17.4) — session resync after disconnect.
 *
 * Aggregates Scene + last 200 ChatMessages + InitiativeEntries[] + serverTime
 * via parallel fork (Promise.all). Total budget per НФВ 3.2: ≤ 10 s real-world
 * (≤ 100 ms on mocked DB in unit tests).
 */
export class SessionResyncService {
  constructor(
    private readonly sceneService: SceneService,
    private readonly initiative: InitiativeRepository,
    private readonly messages: ChatMessageRepository,
    private readonly audioState: AudioStateProvider | null = null,
  ) {}

  /**
   * @param roomId room the user is rejoining
   * @param viewerRole role of the viewer (drives A6 token projection)
   * @param viewerId UUID of the viewer
   * @returns SessionResyncPayload ready to emit on `session:resync`
   * @throws HttpError 404 if the room has no active scene
   */
  async buildResyncPayload(
    roomId: string,
    viewerRole: Role,
    viewerId: string,
  ): Promise<SessionResyncPayload> {
    const sceneSnapshotPromise = this.sceneService.getActiveSnapshot(
      roomId,
      viewerRole,
      viewerId,
    );
    // Observer-isolation (§3): Player viewers never see observer-channel rows
    // — the repository drops them via SQL filter. GM and Observer see all rows.
    const messagesPromise = this.messages.listRecent(roomId, 200, { viewerRole });

    const [scene, rawMessages] = await Promise.all([
      sceneSnapshotPromise,
      messagesPromise,
    ]);

    if (!scene) throw new HttpError(404, 'Room has no active scene');

    const initiativeEntries = await this.initiative.listByScene(scene.id);

    // Whisper / secret_roll filter — mode is checked first because secret_roll
    // has recipientId=null but is still restricted (visible only to GM and sender).
    // For ordinary broadcast modes (normal/ic/ooc), all viewers pass.
    const messages = rawMessages
      .filter((m) => {
        if (m.mode === 'whisper') {
          return m.senderId === viewerId || m.recipientId === viewerId;
        }
        if (m.mode === 'secret_roll') {
          return viewerRole === 'GM' || m.senderId === viewerId;
        }
        return true;
      })
      .map(projectChatMessage);

    const currentAudio = this.audioState
      ? this.audioState.getCurrentForRoom(roomId)
      : { music: null, ambient: null };

    return {
      scene,
      messages,
      initiatives: initiativeEntries.map(projectInitiative),
      serverTime: Date.now(),
      currentAudio,
    };
  }
}
