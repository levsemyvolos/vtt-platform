import type { AnnotationPingPayload } from '@vtt/shared';

/** Sink for `cursor:ping` broadcasts — abstracted to keep the service WSS-agnostic. */
export type AnnotationBroadcaster = (roomId: string, payload: AnnotationPingPayload) => void;

/**
 * Ephemeral-annotation service (Ф3.4.1).
 *
 * Ping markers are never persisted — the service only forwards the payload
 * to the room via the injected broadcaster. No DB interaction, no OCC, no
 * rollback — just fire-and-forget broadcast.
 *
 * Any role (GM / Player / Observer) may send a ping; the handler enforces
 * that the socket is joined to the claimed roomId before calling this method.
 */
export class AnnotationService {
  constructor(private readonly broadcast: AnnotationBroadcaster) {}

  broadcastPing(payload: AnnotationPingPayload): void {
    this.broadcast(payload.roomId, payload);
  }
}
