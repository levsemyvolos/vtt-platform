import { describe, it, expect, vi } from 'vitest';
import { AnnotationService } from '../../src/services/AnnotationService.js';
import type { AnnotationPingPayload } from '@vtt/shared';

function makePayload(overrides?: Partial<AnnotationPingPayload>): AnnotationPingPayload {
  return {
    roomId: 'room-1',
    sceneId: 'scene-1',
    x: 150,
    y: 300,
    color: '#ef4444',
    userId: 'user-1',
    timestamp: 1700000000000,
    ...overrides,
  };
}

describe('AnnotationService.broadcastPing', () => {
  it('calls broadcaster with the correct roomId and full payload', () => {
    const broadcast = vi.fn();
    const svc = new AnnotationService(broadcast);
    const payload = makePayload();

    svc.broadcastPing(payload);

    expect(broadcast).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledWith('room-1', payload);
  });

  it('any role may ping — no RBAC guard inside the service', () => {
    // The service has no role field; the socket handler enforces roomId membership
    // only. This test confirms the service does not throw or filter by role.
    const broadcast = vi.fn();
    const svc = new AnnotationService(broadcast);

    svc.broadcastPing(makePayload({ userId: 'observer-xyz' }));
    svc.broadcastPing(makePayload({ userId: 'player-abc' }));

    expect(broadcast).toHaveBeenCalledTimes(2);
  });
});
