import type { AnnotationPingPayload, MeasurePayload } from '@vtt/shared';

/** Broadcast sinks for ephemeral annotation events — abstracted for WSS-agnostic testing. */
export interface AnnotationBroadcast {
  ping: (roomId: string, payload: AnnotationPingPayload) => void;
  measure: (roomId: string, payload: MeasurePayload) => void;
}

/**
 * Ephemeral-annotation service (Ф3.4.1, Ф3.4.3).
 *
 * All payloads are fire-and-forget; no DB interaction, no OCC, no rollback.
 * Role restrictions are enforced at the socket handler level, not here.
 */
export class AnnotationService {
  constructor(private readonly broadcast: AnnotationBroadcast) {}

  broadcastPing(payload: AnnotationPingPayload): void {
    this.broadcast.ping(payload.roomId, payload);
  }

  broadcastMeasure(payload: MeasurePayload): void {
    this.broadcast.measure(payload.roomId, payload);
  }
}
