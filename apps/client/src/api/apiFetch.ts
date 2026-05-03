import type { AuthTokenPair } from '@vtt/shared';
import { tokenStore } from './tokenStore';
import { store } from '../store';
import { addToast } from '../store/toast';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let isRefreshing = false;
type RefreshCallback = (token: string | null) => void;
const refreshQueue: RefreshCallback[] = [];

async function doRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) {
    tokenStore.clear();
    return null;
  }

  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!res.ok) {
    tokenStore.clear();
    return null;
  }

  const data = (await res.json()) as AuthTokenPair;
  tokenStore.setAccess(data.accessToken);
  tokenStore.setRefresh(data.refreshToken);
  return data.accessToken;
}

// Serialises concurrent 401s into one refresh call; others wait in queue.
async function refreshOnce(): Promise<string | null> {
  if (isRefreshing) {
    return new Promise<string | null>((resolve) => {
      refreshQueue.push(resolve);
    });
  }

  isRefreshing = true;
  try {
    const token = await doRefresh();
    refreshQueue.forEach((cb) => cb(token));
    return token;
  } finally {
    refreshQueue.length = 0;
    isRefreshing = false;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({})) as {
    error?: { message?: string };
    code?: string;
    issues?: unknown[];
  };
  // 5xx leak guard: server can surface infra details (Prisma SQL, stack frames).
  // Replace with an i18n key that callers resolve via `t()`. Raw text is kept
  // in console for developers but never reaches the user-facing UI.
  if (res.status >= 500) {
    if (body.error?.message) {
      // eslint-disable-next-line no-console
      console.error('[apiFetch] server 5xx detail:', body.error.message);
    }
    return new ApiError(res.status, 'errors:server.generic');
  }
  // R2-MIN-NEW-003: 400 with Zod issues or without a specific message → generic validation key.
  if (res.status === 400) {
    if (body.code || body.issues) {
      return new ApiError(res.status, 'errors:validation.generic');
    }
    if (!body.error?.message) {
      return new ApiError(res.status, 'errors:validation.generic');
    }
  }
  return new ApiError(res.status, body.error?.message ?? res.statusText);
}

/**
 * Build request headers. When `body` is a FormData instance the browser must
 * set Content-Type (including the multipart boundary) automatically — omit it.
 * For Blob/File bodies the caller must pass an explicit Content-Type header.
 */
function buildHeaders(body: BodyInit | null | undefined, extra?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const access = tokenStore.getAccess();
  if (access) headers['Authorization'] = `Bearer ${access}`;
  if (extra && !(extra instanceof Headers) && !Array.isArray(extra)) {
    Object.assign(headers, extra);
  }
  return headers;
}

const FETCH_TIMEOUT_MS = 60_000;

// eslint-disable-next-line complexity
export async function apiFetch<TRes = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<TRes> {
  const headers = buildHeaders(options.body, options.headers);

  // Wave 3.2 — 60-second timeout so cold-start hangs surface as a typed error.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(0, 'errors:network.timeout');
    }
    // B5-MIN-003: TypeError (Failed to fetch / offline) → localized i18n key.
    if (err instanceof TypeError) {
      throw new ApiError(0, 'errors:network.failed');
    }
    throw err;
  }
  clearTimeout(timer);

  if (res.status === 401) {
    const newToken = await refreshOnce();
    if (!newToken) throw new ApiError(401, 'Unauthorized');

    headers['Authorization'] = `Bearer ${newToken}`;
    const retry = await fetch(url, { ...options, headers });
    if (!retry.ok) throw await parseError(retry);
    if (retry.status === 204) return undefined as TRes;
    return retry.json() as Promise<TRes>;
  }

  if (!res.ok) {
    const err = await parseError(res);
    if (res.status >= 500) {
      // err.message is already an i18n key from parseError; Toast resolves it.
      store.dispatch(addToast('error', err.message));
    }
    // R2-MIN-NEW-003: show generic validation toast on 400 with zod/missing message.
    if (res.status === 400 && err.message === 'errors:validation.generic') {
      store.dispatch(addToast('error', err.message));
    }
    throw err;
  }
  if (res.status === 204) return undefined as TRes;
  return res.json() as Promise<TRes>;
}
