/**
 * SSE keepalive helper — unit tests.
 *
 * Background: `: keep-alive\n\n` comment frames every 15 seconds survive
 * proxy idle timeouts on Render / ALB / nginx. With preview-tier models
 * (gemini-3-flash-preview text TTFB ≈ 10s; gemini-3.1-flash-image-preview
 * ≈ 15s), a stall before the first data frame can exceed the proxy idle
 * window and cause silent disconnects.
 *
 * These tests pin the contract of `buildSseStream`:
 *   - sets the four SSE response headers and flushes them
 *   - emits a heartbeat comment frame at every 15s tick
 *   - cleanup() stops the heartbeat (no timer leaks)
 *   - emit() writes well-formed `data:` frames
 *   - controller aborts when the client disconnects (req emits 'close')
 *   - heartbeat skips writing once the response is finished, no late writes
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import type { Request, Response } from 'express';
import { buildSseStream } from '../../src/lib/sseStream.js';

interface FakeRes {
  setHeader: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  writableEnded: boolean;
}

function makeFakeReq(): Request {
  return new EventEmitter() as unknown as Request;
}

function makeFakeRes(): { res: Response; writes: string[]; headers: Record<string, string>; raw: FakeRes } {
  const writes: string[] = [];
  const headers: Record<string, string> = {};
  const raw: FakeRes = {
    setHeader: vi.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => {
      writes.push(chunk);
      return true;
    }),
    end: vi.fn(),
    writableEnded: false,
  };
  return { res: raw as unknown as Response, writes, headers, raw };
}

describe('buildSseStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets the four SSE response headers and flushes them', () => {
    const req = makeFakeReq();
    const { res, headers, raw } = makeFakeRes();
    const handle = buildSseStream(req, res);

    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(headers['Connection']).toBe('keep-alive');
    expect(headers['X-Accel-Buffering']).toBe('no');
    expect(raw.flushHeaders).toHaveBeenCalledOnce();

    handle.cleanup();
  });

  it('writes a `: keep-alive` comment frame every 15 seconds', () => {
    const req = makeFakeReq();
    const { res, writes } = makeFakeRes();
    const handle = buildSseStream(req, res);

    expect(writes).toEqual([]);
    vi.advanceTimersByTime(15_000);
    expect(writes).toEqual([': keep-alive\n\n']);
    vi.advanceTimersByTime(15_000);
    expect(writes).toEqual([': keep-alive\n\n', ': keep-alive\n\n']);
    vi.advanceTimersByTime(15_000);
    expect(writes).toEqual([': keep-alive\n\n', ': keep-alive\n\n', ': keep-alive\n\n']);

    handle.cleanup();
  });

  it('cleanup() stops the heartbeat — no further frames are written', () => {
    const req = makeFakeReq();
    const { res, writes } = makeFakeRes();
    const handle = buildSseStream(req, res);

    vi.advanceTimersByTime(15_000);
    expect(writes).toHaveLength(1);

    handle.cleanup();
    vi.advanceTimersByTime(60_000);
    expect(writes).toHaveLength(1);
  });

  it('skips heartbeat write when response is already ended (race-safe)', () => {
    const req = makeFakeReq();
    const { res, writes, raw } = makeFakeRes();
    const handle = buildSseStream(req, res);

    raw.writableEnded = true;
    vi.advanceTimersByTime(15_000);
    expect(writes).toEqual([]);

    handle.cleanup();
  });

  it('emit() writes a well-formed SSE data frame', () => {
    const req = makeFakeReq();
    const { res, writes } = makeFakeRes();
    const handle = buildSseStream(req, res);

    handle.emit({ type: 'chunk', delta: 'hello' });
    handle.emit({ type: 'done', content: 'hello world' });

    expect(writes[0]).toBe('data: {"type":"chunk","delta":"hello"}\n\n');
    expect(writes[1]).toBe('data: {"type":"done","content":"hello world"}\n\n');

    handle.cleanup();
  });

  it("aborts the controller when the request emits 'close'", () => {
    const req = makeFakeReq();
    const { res } = makeFakeRes();
    const handle = buildSseStream(req, res);

    expect(handle.controller.signal.aborted).toBe(false);
    (req as unknown as EventEmitter).emit('close');
    expect(handle.controller.signal.aborted).toBe(true);

    handle.cleanup();
  });
});
