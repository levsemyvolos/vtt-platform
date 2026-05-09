import type { AssistantTextRequest, AssistantTextResponse, AssistantStreamEvent, AssistantStreamRequest, SRDLookupRequest, SRDLookupResponse, AIQuotaResponse, AssistantImageConversationDTO, AssistantImageTurnDTO, CreateImageConversationRequest, RenameImageConversationRequest, ContinueImageConversationRequest, ContinueImageConversationResponse, ListImageConversationsResponse, ListImageTurnsResponse, AssistantConversationDTO, UpdateConversationDefaultsRequest, AssistantVariables, PromptAssistRequest, PromptAssistResponse } from '@vtt/shared';
import { apiFetchWithMeta, ApiError, apiFetch } from './apiFetch';
import { tokenStore } from './tokenStore';

export interface AssistantTextResult {
  data: AssistantTextResponse;
  rateLimitRemaining: number | null;
}

export async function postAssistantText(req: AssistantTextRequest): Promise<AssistantTextResult> {
  const { data, meta } = await apiFetchWithMeta<AssistantTextResponse>('/api/ai/text', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  return { data, rateLimitRemaining: meta.rateLimitRemaining };
}

export interface StreamAssistantResult {
  /** Async iterable yielding typed SSE events. */
  events: AsyncIterable<AssistantStreamEvent>;
  /** Rate-limit remaining parsed from response headers, null if absent. */
  rateLimitRemaining: number | null;
}

// ─── Internal SSE helper ────────────────────────────────────────────────────

async function openSseStream(
  url: string,
  body: object | null,
  signal: AbortSignal,
): Promise<StreamAssistantResult> {
  const access = tokenStore.getAccess();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'text/event-stream',
  };
  if (access) headers['Authorization'] = `Bearer ${access}`;

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: body === null ? '{}' : JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    let message = response.statusText;
    let kind: string | undefined;
    try {
      const errBody = await response.json() as { error?: { message?: string; kind?: string } };
      message = errBody.error?.message ?? message;
      kind = errBody.error?.kind;
    } catch {
      // non-JSON body
    }
    throw new ApiError(response.status, message, kind);
  }

  return {
    events: parseSseStream(response.body, signal),
    rateLimitRemaining: parseRateLimitRemaining(response.headers),
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Opens an SSE stream against POST /api/ai/text/stream.
 *
 * Usage:
 * ```ts
 * const { events, rateLimitRemaining } = await streamAssistantText(req, signal);
 * for await (const ev of events) {
 *   if (ev.type === 'chunk') ... ;
 * }
 * ```
 *
 * Throws ApiError on non-2xx status before any events are yielded.
 * Honours AbortSignal — caller may cancel mid-stream.
 */
export async function streamAssistantText(
  req: AssistantStreamRequest,
  signal: AbortSignal,
): Promise<StreamAssistantResult> {
  return openSseStream('/api/ai/text/stream', req, signal);
}

/**
 * Opens an SSE stream against POST /api/ai/conversations/:id/regenerate.
 * Drops the last assistant message server-side and restreams a new response.
 */
export async function streamRegenerate(
  conversationId: string,
  signal: AbortSignal,
): Promise<StreamAssistantResult> {
  return openSseStream(`/api/ai/conversations/${conversationId}/regenerate`, null, signal);
}

/**
 * Opens an SSE stream against POST /api/ai/conversations/:id/messages/:msgId/edit.
 * Edits the user message server-side, drops everything after it, and restreams.
 */
export async function streamEditAndResend(
  conversationId: string,
  messageId: string,
  content: string,
  signal: AbortSignal,
): Promise<StreamAssistantResult> {
  return openSseStream(
    `/api/ai/conversations/${conversationId}/messages/${messageId}/edit`,
    { content },
    signal,
  );
}

/**
 * Single-turn SRD rule lookup. No conversation history, no DB write.
 */
export function lookupSRD(req: SRDLookupRequest): Promise<SRDLookupResponse> {
  return apiFetch<SRDLookupResponse>('/api/ai/srd', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

/**
 * S7.2 / P5.3 — LLM-as-prompt-generator. One-shot, GM-only.
 * Server validates target ('image' | 'music') + length; returns `{draft}`.
 */
export function promptAssist(req: PromptAssistRequest): Promise<PromptAssistResponse> {
  return apiFetch<PromptAssistResponse>('/api/ai/prompt-assist', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function getAIQuota(roomId: string): Promise<AIQuotaResponse> {
  return apiFetch<AIQuotaResponse>(`/api/ai/quota?roomId=${encodeURIComponent(roomId)}`);
}

// ---------- Conversation defaults (Session 3.2) ----------

/** GET /api/ai/conversations — used to read a conversation's persisted defaults. */
export function getConversation(id: string): Promise<AssistantConversationDTO> {
  return apiFetch<AssistantConversationDTO>(`/api/ai/conversations/${encodeURIComponent(id)}`);
}

/** PATCH /api/ai/conversations/:id/defaults — owner-only, full-replace semantics. */
export function updateConversationDefaults(
  id: string,
  defaults: AssistantVariables,
): Promise<AssistantConversationDTO> {
  const body: UpdateConversationDefaultsRequest = { defaults };
  return apiFetch<AssistantConversationDTO>(`/api/ai/conversations/${encodeURIComponent(id)}/defaults`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ---------- Image conversations (Session 7.2) ----------

export async function listImageConversations(roomId: string): Promise<AssistantImageConversationDTO[]> {
  const res = await apiFetch<ListImageConversationsResponse>(
    `/api/ai/image-conversations?roomId=${encodeURIComponent(roomId)}`,
  );
  return res.conversations;
}

export function createImageConversation(req: CreateImageConversationRequest): Promise<AssistantImageConversationDTO> {
  return apiFetch<AssistantImageConversationDTO>('/api/ai/image-conversations', {
    method: 'POST',
    body: JSON.stringify(req),
  });
}

export function renameImageConversation(id: string, req: RenameImageConversationRequest): Promise<AssistantImageConversationDTO> {
  return apiFetch<AssistantImageConversationDTO>(`/api/ai/image-conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(req),
  });
}

export async function deleteImageConversation(id: string): Promise<void> {
  await apiFetch<void>(`/api/ai/image-conversations/${id}`, { method: 'DELETE' });
}

export async function listImageTurns(conversationId: string): Promise<AssistantImageTurnDTO[]> {
  const res = await apiFetch<ListImageTurnsResponse>(
    `/api/ai/image-conversations/${conversationId}/turns`,
  );
  return res.turns;
}

export function continueImageConversation(
  conversationId: string,
  req: ContinueImageConversationRequest,
): Promise<ContinueImageConversationResponse> {
  return apiFetch<ContinueImageConversationResponse>(
    `/api/ai/image-conversations/${conversationId}/turns`,
    { method: 'POST', body: JSON.stringify(req) },
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseRateLimitRemaining(headers: Headers): number | null {
  const combined = headers.get('RateLimit') ?? headers.get('ratelimit');
  if (combined) {
    const m = combined.match(/remaining=(\d+)/i);
    if (m && m[1]) return Number(m[1]);
  }
  const legacy = headers.get('RateLimit-Remaining') ?? headers.get('ratelimit-remaining');
  if (legacy) {
    const n = Number(legacy);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

async function* parseSseStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncIterable<AssistantStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) {
        // Flush any trailing frame without \n\n boundary.
        const trailing = parseSseFrame(buf);
        if (trailing) yield trailing;
        return;
      }
      buf += decoder.decode(value, { stream: true });
      // SSE frames separated by \n\n.
      let boundary = buf.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buf.slice(0, boundary);
        buf = buf.slice(boundary + 2);
        const event = parseSseFrame(frame);
        if (event) yield event;
        boundary = buf.indexOf('\n\n');
      }
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

function parseSseFrame(raw: string): AssistantStreamEvent | null {
  // A frame may have multiple lines (event:, data:, id:, comment lines starting with ':').
  // We only consume `data:` lines.
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^\s/, ''));
    }
  }
  if (dataLines.length === 0) return null;
  const json = dataLines.join('\n');
  try {
    return JSON.parse(json) as AssistantStreamEvent;
  } catch {
    return null;
  }
}
