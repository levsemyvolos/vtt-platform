import { randomUUID } from 'crypto';
import type { InitiativeEntry } from '@prisma/client';
import type { InitiativeEntryDTO } from '@vtt/shared';
import type { InitiativeRepository } from '../repositories/InitiativeRepository.js';
import type { SceneRepository } from '../repositories/SceneRepository.js';
import { HttpError } from '../lib/errors.js';
import { projectInitiative } from './projections.js';

interface InitiativeSnapshot {
  entries: InitiativeEntryDTO[];
  currentRound: number;
}

/**
 * Initiative tracker service (Ф7.3).
 *
 * Round counter (`currentRound`) policy:
 *   - First `advanceTurn` on a scene with no current entry → entry[0] becomes
 *     current, `currentRound` = 1.
 *   - Each subsequent `advanceTurn` moves to the next entry in the
 *     repository order; when it wraps to index 0, `currentRound` increments.
 *
 * MVP storage: `currentRound` is kept in an in-process `Map`. Persisting it
 * requires a `Scene.currentRound` column (out of scope for Этап 1) — restart
 * resets the counter. Acceptable for the diploma demo; production-grade
 * persistence is tracked as future work.
 *
 * The service NEVER touches socket.io directly — REST handlers (and, in
 * future, WSS handlers) broadcast the snapshot returned from these methods.
 */
export class InitiativeService {
  /** sceneId → currentRound. */
  private readonly rounds = new Map<string, number>();

  constructor(
    private readonly initiativeRepo: InitiativeRepository,
    private readonly sceneRepo: SceneRepository,
  ) {}

  /**
   * Resolves the room that owns `sceneId`. Used by route handlers to scope
   * broadcasts to `io.to(roomId)`.
   * @throws HttpError 404 if scene does not exist
   */
  async getRoomIdForScene(sceneId: string): Promise<string> {
    const scene = await this.sceneRepo.findById(sceneId);
    if (!scene) throw new HttpError(404, 'Scene not found');
    return scene.roomId;
  }

  async getSnapshot(sceneId: string): Promise<InitiativeSnapshot> {
    const rows = await this.initiativeRepo.listByScene(sceneId);
    return {
      entries: rows.map(projectInitiative),
      currentRound: this.rounds.get(sceneId) ?? 0,
    };
  }

  /**
   * Appends a new entry at the end of the order (orderIndex = current count).
   */
  async addEntry(
    sceneId: string,
    name: string,
    initiative: number,
  ): Promise<InitiativeSnapshot> {
    const count = await this.initiativeRepo.count(sceneId);
    await this.initiativeRepo.create({
      id: randomUUID(),
      scene: { connect: { id: sceneId } },
      name,
      initiative,
      orderIndex: count,
    });
    return this.getSnapshot(sceneId);
  }

  async removeEntry(sceneId: string, entryId: string): Promise<InitiativeSnapshot> {
    const entry = await this.initiativeRepo.findById(entryId);
    if (!entry || entry.sceneId !== sceneId) {
      throw new HttpError(404, 'Initiative entry not found');
    }

    const wasCurrent = entry.isCurrent;
    await this.initiativeRepo.delete(entryId);

    if (wasCurrent) {
      // Pick the next entry in the post-deletion order; wrap to start.
      const remaining = await this.initiativeRepo.listByScene(sceneId);
      if (remaining.length > 0) {
        const nextIdx = entry.orderIndex < remaining.length ? entry.orderIndex : 0;
        const next = remaining[nextIdx] ?? remaining[0];
        if (next) await this.initiativeRepo.setCurrent(sceneId, next.id);
      } else {
        this.rounds.delete(sceneId);
      }
    }

    return this.getSnapshot(sceneId);
  }

  async reorder(sceneId: string, orderedIds: string[]): Promise<InitiativeSnapshot> {
    await this.initiativeRepo.updateOrder(sceneId, orderedIds);
    return this.getSnapshot(sceneId);
  }

  /**
   * Advances the active turn to the next entry in scene order.
   *
   * State machine:
   *   - No current entry  → set entry[0] as current, round := 1.
   *   - Has current entry → move to entry[(idx+1) % N]; if wrap, round++.
   *
   * @throws HttpError 400 if the scene has no entries
   */
  async advanceTurn(sceneId: string): Promise<InitiativeSnapshot> {
    const ordered = await this.initiativeRepo.listByScene(sceneId);
    if (ordered.length === 0) {
      throw new HttpError(400, 'Cannot advance turn: initiative list is empty');
    }

    const currentIdx = ordered.findIndex((e: InitiativeEntry) => e.isCurrent);

    if (currentIdx === -1) {
      // No active entry yet — start round 1 on the first entry.
      const first = ordered[0]!;
      await this.initiativeRepo.setCurrent(sceneId, first.id);
      this.rounds.set(sceneId, 1);
    } else {
      const nextIdx = (currentIdx + 1) % ordered.length;
      const next = ordered[nextIdx]!;
      await this.initiativeRepo.setCurrent(sceneId, next.id);
      if (nextIdx === 0) {
        this.rounds.set(sceneId, (this.rounds.get(sceneId) ?? 1) + 1);
      }
    }

    return this.getSnapshot(sceneId);
  }
}
