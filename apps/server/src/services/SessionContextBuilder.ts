import type { Role } from '@vtt/shared';
import type { SceneService } from './SceneService.js';
import type { InitiativeService } from './InitiativeService.js';
import type { CharacterService } from './CharacterService.js';
import type { ChatMessageRepository } from '../repositories/ChatMessageRepository.js';
import type { RoomRepository } from '../repositories/RoomRepository.js';

const MAX_CONTEXT_CHARS = 2000;
const RECENT_CHAT_LIMIT = 5;

interface BuildOptions {
  /** Cap output length. Sections are truncated from least-important first if exceeded. */
  maxChars?: number;
}

/**
 * Aggregates room state (active scene, initiative, characters, recent chat)
 * into a single markdown block injectable into LLM system prompts (X1-lite,
 */
 *
 * Privacy: respects RBAC by going through SceneService/CharacterService
 * with the caller's role+id, so a player asking the AI never sees state
 * the UI would hide from them.
 */
export class SessionContextBuilder {
  constructor(
    private readonly scenes: SceneService,
    private readonly initiative: InitiativeService,
    private readonly characters: CharacterService,
    private readonly chatRepo: ChatMessageRepository,
    private readonly roomRepo: RoomRepository,
  ) {}

  async build(roomId: string, userId: string, opts: BuildOptions = {}): Promise<string> {
    const role = await this.resolveRole(roomId, userId);
    const sceneSection = await this.buildSceneSection(roomId, role, userId);
    const initiativeSection = await this.buildInitiativeSection(sceneSection.sceneId);
    const charactersSection = await this.buildCharactersSection(roomId, role, userId);
    const chatSection = await this.buildChatSection(roomId);

    // Priority for truncation: scene > initiative > characters > chat.
    const sections = [
      { name: 'scene', text: sceneSection.text },
      { name: 'initiative', text: initiativeSection },
      { name: 'characters', text: charactersSection },
      { name: 'chat', text: chatSection },
    ].filter((s) => s.text.length > 0);

    const cap = opts.maxChars ?? MAX_CONTEXT_CHARS;
    return this.assemble(sections, cap);
  }

  private async resolveRole(roomId: string, userId: string): Promise<Role> {
    const room = await this.roomRepo.findById(roomId);
    if (!room) return 'Observer';
    if (room.ownerId === userId) return 'GM';
    const isMember = await this.roomRepo.isMember(roomId, userId);
    return isMember ? 'Player' : 'Observer';
  }

  private async buildSceneSection(
    roomId: string,
    role: Role,
    viewerId: string,
  ): Promise<{ sceneId: string | null; text: string }> {
    try {
      const scene = await this.scenes.getActiveSnapshot(roomId, role, viewerId);
      if (!scene) return { sceneId: null, text: '' };
      return {
        sceneId: scene.id,
        text: `**Поточна сцена:** ${scene.name}`,
      };
    } catch {
      return { sceneId: null, text: '' };
    }
  }

  private async buildInitiativeSection(sceneId: string | null): Promise<string> {
    if (!sceneId) return '';
    try {
      const snap = await this.initiative.getSnapshot(sceneId);
      if (!snap.entries || snap.entries.length === 0) return '';
      const lines = snap.entries
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((e) => {
          const turn = e.isCurrent ? ' ← active' : '';
          return `- ${e.initiative} — ${e.name}${turn}`;
        });
      return `**Ініціатива:** раунд ${snap.currentRound}\n${lines.join('\n')}`;
    } catch {
      return '';
    }
  }

  private async buildCharactersSection(
    roomId: string,
    role: Role,
    viewerId: string,
  ): Promise<string> {
    try {
      const sheets = await this.characters.listForViewer(roomId, role, viewerId);
      if (sheets.length === 0) return '';
      const lines = sheets.map((c) => {
        if (c.kind === 'full' && c.sheetData != null) {
          const data = c.sheetData as { class?: string; level?: number };
          if (data.class && data.level) return `- ${c.name} (${data.class} ${data.level})`;
        }
        return `- ${c.name}`;
      });
      return `**Персонажі гравців:**\n${lines.join('\n')}`;
    } catch {
      return '';
    }
  }

  private async buildChatSection(roomId: string): Promise<string> {
    try {
      // listRecent already returns rows oldest-first (ascending createdAt).
      const rows = await this.chatRepo.listRecent(roomId, RECENT_CHAT_LIMIT);
      if (rows.length === 0) return '';
      const lines = rows.map((m) => {
        const truncated = m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body;
        return `- ${truncated}`;
      });
      return `**Останні дії в чаті:**\n${lines.join('\n')}`;
    } catch {
      return '';
    }
  }

  private assemble(sections: ReadonlyArray<{ name: string; text: string }>, cap: number): string {
    if (sections.length === 0) return '';
    const join = (arr: ReadonlyArray<{ text: string }>): string =>
      arr.map((s) => s.text).join('\n\n');

    let kept = sections.slice();
    while (kept.length > 0 && join(kept).length > cap) {
      kept = kept.slice(0, -1); // drop least-important from the end
    }
    return join(kept);
  }
}
