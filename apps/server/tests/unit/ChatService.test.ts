import { describe, it, expect, vi } from 'vitest';
import type { ChatMessage } from '@prisma/client';
import { ChatService } from '../../src/services/ChatService.js';
import type { ChatMessageRepository } from '../../src/repositories/ChatMessageRepository.js';

/**
 * Observer-isolation §3 — ChatService routing.
 *
 * The service deterministically derives the delivery channel from the sender's
 * per-room role: Observer-authored → `observer` (unicast to observers + GMs);
 * GM/Player-authored → `public` (broadcast / whisper-unicast).
 */
function buildRepoMock(): ChatMessageRepository {
  const create = vi.fn((data: { mode: string; channel?: string; sender: { connect: { id: string } } }) =>
    Promise.resolve({
      id: 'msg-fake',
      roomId: 'room-1',
      senderId: data.sender.connect.id,
      mode: data.mode,
      channel: data.channel ?? 'public',
      body: 'x',
      rollPayload: null,
      recipientId: null,
      createdAt: new Date('2026-05-12T10:00:00Z'),
    } as unknown as ChatMessage),
  );
  return { create, listRecent: vi.fn() } as unknown as ChatMessageRepository;
}

describe('ChatService.createMessage — Observer isolation §3', () => {
  it('GM-authored message → channel="public", broadcast', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    const { message, delivery } = await svc.createMessage(
      { userId: 'gm-1', role: 'GM' },
      { roomId: 'room-1', text: 'hello', mode: 'ic' },
      { gmUserIds: ['gm-1'], observerUserIds: ['obs-1', 'obs-2'] },
    );
    expect(message.channel).toBe('public');
    expect(delivery.mode).toBe('broadcast');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'public' }),
    );
  });

  it('Player-authored message → channel="public", broadcast (observers see it too)', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    const { delivery } = await svc.createMessage(
      { userId: 'player-1', role: 'Player' },
      { roomId: 'room-1', text: 'hi', mode: 'ic' },
      { gmUserIds: ['gm-1'], observerUserIds: ['obs-1'] },
    );
    expect(delivery.mode).toBe('broadcast');
  });

  it('Observer-authored message → channel="observer", unicast to observers + GMs + self', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    const { message, delivery } = await svc.createMessage(
      { userId: 'obs-1', role: 'Observer' },
      { roomId: 'room-1', text: 'hello fellow observers', mode: 'ic' },
      { gmUserIds: ['gm-1'], observerUserIds: ['obs-1', 'obs-2'] },
    );
    expect(message.channel).toBe('observer');
    expect(delivery.mode).toBe('unicast');
    expect(delivery.recipients.sort()).toEqual(['gm-1', 'obs-1', 'obs-2'].sort());
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'observer' }),
    );
  });

  it('Observer cannot escape the observer channel even by sending mode=whisper', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    const { message, delivery } = await svc.createMessage(
      { userId: 'obs-1', role: 'Observer' },
      { roomId: 'room-1', text: 'whisper attempt', mode: 'whisper', recipientId: 'player-1' },
      { gmUserIds: ['gm-1'], observerUserIds: ['obs-1', 'obs-2'] },
    );
    expect(message.channel).toBe('observer');
    expect(delivery.recipients).not.toContain('player-1');
    expect(delivery.recipients.sort()).toEqual(['gm-1', 'obs-1', 'obs-2'].sort());
  });

  it('GM whisper to Player still channel="public" and unicast to [sender, recipient]', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    const { delivery } = await svc.createMessage(
      { userId: 'gm-1', role: 'GM' },
      { roomId: 'room-1', text: 'psst', mode: 'whisper', recipientId: 'player-1' },
      { gmUserIds: ['gm-1'], observerUserIds: [] },
    );
    expect(delivery.mode).toBe('unicast');
    expect(delivery.recipients.sort()).toEqual(['gm-1', 'player-1'].sort());
  });

  it('rejects secret_roll mode (reserved for dice handler)', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    await expect(
      svc.createMessage(
        { userId: 'gm-1', role: 'GM' },
        { roomId: 'room-1', text: '1d20', mode: 'secret_roll' },
        { gmUserIds: ['gm-1'], observerUserIds: [] },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('GM/Player whisper without recipientId → 400', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    await expect(
      svc.createMessage(
        { userId: 'player-1', role: 'Player' },
        { roomId: 'room-1', text: 'psst', mode: 'whisper' },
        { gmUserIds: ['gm-1'], observerUserIds: [] },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('ChatService.recordDiceRoll — channel is always public', () => {
  it('always persists with channel="public"', async () => {
    const repo = buildRepoMock();
    const svc = new ChatService(repo);
    await svc.recordDiceRoll(
      'player-1',
      'room-1',
      { expression: '1d20', total: 17, rolls: [17], mode: 'normal' },
      false,
      ['gm-1'],
    );
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'public' }),
    );
  });
});
