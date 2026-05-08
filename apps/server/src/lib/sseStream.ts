import type { EventEmitter } from 'events';
import type { Response } from 'express';
import type { AssistantStreamEvent } from '@vtt/shared';

/**
 * Minimal request shape — we only need to subscribe to the 'close' event so
 * we can abort downstream work when the client disconnects. Typing it as
 * `EventEmitter` keeps the helper agnostic of the route's `Request<Params,
 * ResBody, ReqBody>` generic shape (which varies across the 3 SSE routes
 * and would otherwise force a `Request<any, any, any>` escape hatch).
 */
type SseReq = Pick<EventEmitter, 'on'>;

/**
 * SSE keepalive heartbeat interval — 15 seconds.
 *
 * Master-plan v1 risk register (line 170) called this out:
 *   "Streaming через ALB/Render proxy дропає з'єднання → mitigation:
 *    додати keepalive comment-frames кожні 15с (`: keep-alive\n\n`)".
 *
 * The migration to gemini-3-flash-preview (text TTFB ≈ 10s on global region)
 * and gemini-3.1-flash-image-preview (≈ 15s) makes this critical: a stalled
 * model call without heartbeat can exceed Render's default 60s idle timeout
 * before the first data frame, causing the proxy to silently disconnect.
 *
 * Lines beginning with ":" are SSE comments per the spec — clients ignore
 * them, but the bytes flowing keep the TCP socket alive end-to-end.
 */
const HEARTBEAT_INTERVAL_MS = 15_000;

export interface SseStreamHandle {
  /** Writes one SSE `data:` event frame. */
  emit: (event: AssistantStreamEvent) => void;
  /** Aborts when the client disconnects (req.on('close')). */
  controller: AbortController;
  /** MUST be called from `finally` — clears the heartbeat timer. */
  cleanup: () => void;
}

/**
 * Bootstraps an SSE response: sets response headers, flushes them, wires up
 * abort-on-client-close, and starts a 15-second keep-alive heartbeat.
 *
 * Used by the 3 streaming AI routes (POST /text/stream,
 * POST /conversations/:id/regenerate, POST /conversations/:id/messages/:msgId/edit).
 */
export function buildSseStream(req: SseReq, res: Response): SseStreamHandle {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disables nginx buffering
  res.flushHeaders();

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(': keep-alive\n\n');
    }
  }, HEARTBEAT_INTERVAL_MS);

  return {
    emit: (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    },
    controller,
    cleanup: () => clearInterval(heartbeat),
  };
}
