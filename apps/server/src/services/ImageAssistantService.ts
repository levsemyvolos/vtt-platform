import { randomUUID } from 'crypto';
import type { AIProvider, ImageMultiTurnRequest, ImageTurnHistoryEntry } from '../infrastructure/ai/AIProvider.js';
import type { AssistantImageConversationRepository } from '../repositories/AssistantImageConversationRepository.js';
import { AssetService } from './AssetService.js';
import type { AssetRepository } from '../repositories/AssetRepository.js';
import type { FileStorageAdapter } from '../infrastructure/storage/FileStorageAdapter.js';
import type { AssistantImageTurn, Asset } from '@prisma/client';

const MAX_REFERENCES = 3;

export interface ContinueImageConversationResult {
  turnId: string;
  turnIndex: number;
  generatedAssetId: string;
  generatedAssetUrl: string;
}

export class ImageAssistantService {
  constructor(
    private readonly provider: AIProvider,
    private readonly imageConvRepo: AssistantImageConversationRepository,
    private readonly assetService: AssetService,
    private readonly assetRepo: AssetRepository,
    private readonly fileStorage: FileStorageAdapter,
  ) {}

  async createConversation(
    roomId: string,
    userId: string,
    title: string,
  ): Promise<{ id: string; roomId: string; ownerId: string; title: string; createdAt: string; updatedAt: string }> {
    const conv = await this.imageConvRepo.create({
      id: randomUUID(),
      roomId,
      ownerId: userId,
      title: title.trim().slice(0, 120) || 'Нова сцена',
    });
    return {
      id: conv.id,
      roomId: conv.roomId,
      ownerId: conv.ownerId,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  }

  async listConversations(roomId: string, userId: string) {
    const rows = await this.imageConvRepo.findByRoomAndOwner(roomId, userId);
    return rows.map((r) => ({
      id: r.id,
      roomId: r.roomId,
      ownerId: r.ownerId,
      title: r.title,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async listTurns(conversationId: string, userId: string) {
    const conv = await this.imageConvRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    const turns = await this.imageConvRepo.listTurns(conversationId);
    return turns.map((t) => ({
      id: t.id,
      conversationId: t.conversationId,
      turnIndex: t.turnIndex,
      userPrompt: t.userPrompt,
      generatedAssetId: t.generatedAssetId,
      generatedAssetUrl: t.generatedAssetId ? AssetService.getProxyUrl(t.generatedAssetId) : null,
      referenceAssetIds: t.referenceAssetIds,
      referenceAssetUrls: t.referenceAssetIds.map((id) => AssetService.getProxyUrl(id)),
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conv = await this.imageConvRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    await this.imageConvRepo.delete(conversationId);
  }

  async renameConversation(conversationId: string, title: string, userId: string) {
    const conv = await this.imageConvRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    const trimmed = title.trim().slice(0, 120);
    if (trimmed.length === 0) throw new Error('INVALID_TITLE');
    const updated = await this.imageConvRepo.rename(conversationId, trimmed);
    return {
      id: updated.id,
      roomId: updated.roomId,
      ownerId: updated.ownerId,
      title: updated.title,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Sends a new turn: re-builds chat history from prior turns, attaches
   * 0..3 reference assets, calls provider, persists generated Asset + Turn.
   */
  async continueConversation(
    conversationId: string,
    userPrompt: string,
    referenceAssetIds: ReadonlyArray<string>,
    userId: string,
  ): Promise<ContinueImageConversationResult> {
    const conv = await this.imageConvRepo.findById(conversationId);
    if (!conv) throw new Error('NOT_FOUND');
    if (conv.ownerId !== userId) throw new Error('FORBIDDEN');
    if (!userPrompt.trim()) throw new Error('INVALID_CONTENT');
    if (referenceAssetIds.length > MAX_REFERENCES) throw new Error('TOO_MANY_REFERENCES');

    const refAssets = await this.resolveReferenceAssets(referenceAssetIds, conv.roomId);
    const priorTurns = await this.imageConvRepo.listTurns(conversationId);
    const history = await this.loadHistoryFromTurns(priorTurns);
    const references = await this.loadReferences(refAssets);

    const req: ImageMultiTurnRequest = {
      history,
      nextPrompt: userPrompt,
      references,
    };
    const generated = await this.provider.generateImageMultiTurn(req);

    const asset = await this.assetService.storeAiAsset(
      userId,
      conv.roomId,
      generated,
      'image',
      userPrompt,
      'gemini-3.1-flash-image-preview',
    );

    const turnIndex = priorTurns.length;
    const turn = await this.imageConvRepo.appendTurn({
      id: randomUUID(),
      conversationId,
      turnIndex,
      userPrompt,
      generatedAssetId: asset.id,
      referenceAssetIds: [...referenceAssetIds],
    });
    await this.imageConvRepo.touch(conversationId);

    return {
      turnId: turn.id,
      turnIndex,
      generatedAssetId: asset.id,
      generatedAssetUrl: AssetService.getProxyUrl(asset.id),
    };
  }

  private async resolveReferenceAssets(
    referenceAssetIds: ReadonlyArray<string>,
    roomId: string,
  ): Promise<Asset[]> {
    const refAssets = await Promise.all(
      referenceAssetIds.map((id) => this.assetRepo.findById(id)),
    );
    for (const a of refAssets) {
      if (!a) throw new Error('REFERENCE_NOT_FOUND');
      if (a.roomId !== roomId) throw new Error('REFERENCE_NOT_FOUND');
    }
    return refAssets as Asset[];
  }

  private async loadHistoryFromTurns(
    priorTurns: AssistantImageTurn[],
  ): Promise<ImageTurnHistoryEntry[]> {
    const history: ImageTurnHistoryEntry[] = [];
    for (const turn of priorTurns) {
      // User entry — prompt only (skipping reference re-load in history to keep
      // payload sane; references contributed *meaning* to the model output already).
      history.push({ role: 'user', text: turn.userPrompt });
      // Model entry — generated image
      if (turn.generatedAssetId) {
        const entry = await this.loadModelEntry(turn.generatedAssetId);
        if (entry) history.push(entry);
      }
    }
    return history;
  }

  private async loadModelEntry(assetId: string): Promise<ImageTurnHistoryEntry | null> {
    const asset = await this.assetRepo.findById(assetId);
    if (!asset) return null;
    const meta = await this.fileStorage.statObject(asset.storageKey);
    if (!meta) return null;
    const stream = this.fileStorage.createReadStream(asset.storageKey);
    const bytes = await streamToBuffer(stream);
    return { role: 'model', imageBytes: bytes, mimeType: asset.mimeType };
  }

  private async loadReferences(
    refAssets: Asset[],
  ): Promise<ReadonlyArray<{ bytes: Buffer; mimeType: string }>> {
    return Promise.all(
      refAssets.map(async (a) => {
        const stream = this.fileStorage.createReadStream(a.storageKey);
        const bytes = await streamToBuffer(stream);
        return { bytes, mimeType: a.mimeType };
      }),
    );
  }
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}
