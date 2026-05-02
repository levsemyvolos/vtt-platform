import { describe, it, expect, vi } from 'vitest';
import { AnnotationService } from '../../src/services/AnnotationService.js';
import type { AnnotationPingPayload, MeasurePayload } from '@vtt/shared';

function makePingPayload(overrides?: Partial<AnnotationPingPayload>): AnnotationPingPayload {
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

function makeMeasurePayload(overrides?: Partial<MeasurePayload>): MeasurePayload {
  return {
    roomId: 'room-1',
    sceneId: 'scene-1',
    from: { x: 0, y: 0 },
    to: { x: 100, y: 100 },
    userId: 'user-1',
    ...overrides,
  };
}

function makeBroadcast() {
  return { ping: vi.fn(), measure: vi.fn() };
}

describe('AnnotationService.broadcastPing', () => {
  it('calls broadcast.ping with the correct roomId and full payload', () => {
    const broadcast = makeBroadcast();
    const svc = new AnnotationService(broadcast);
    const payload = makePingPayload();

    svc.broadcastPing(payload);

    expect(broadcast.ping).toHaveBeenCalledOnce();
    expect(broadcast.ping).toHaveBeenCalledWith('room-1', payload);
  });

  it('any role may ping — no RBAC guard inside the service', () => {
    const broadcast = makeBroadcast();
    const svc = new AnnotationService(broadcast);

    svc.broadcastPing(makePingPayload({ userId: 'observer-xyz' }));
    svc.broadcastPing(makePingPayload({ userId: 'player-abc' }));

    expect(broadcast.ping).toHaveBeenCalledTimes(2);
  });
});

describe('AnnotationService.broadcastMeasure', () => {
  it('calls broadcast.measure with the correct roomId and full payload', () => {
    const broadcast = makeBroadcast();
    const svc = new AnnotationService(broadcast);
    const payload = makeMeasurePayload();

    svc.broadcastMeasure(payload);

    expect(broadcast.measure).toHaveBeenCalledOnce();
    expect(broadcast.measure).toHaveBeenCalledWith('room-1', payload);
  });

  it('does not call broadcast.ping when measure is sent', () => {
    const broadcast = makeBroadcast();
    const svc = new AnnotationService(broadcast);

    svc.broadcastMeasure(makeMeasurePayload());

    expect(broadcast.ping).not.toHaveBeenCalled();
  });
});
