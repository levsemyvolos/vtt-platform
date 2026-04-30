import type { AuthTokenPair } from '@vtt/shared';
import { tokenStore } from './tokenStore';

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
  const body = await res.json().catch(() => ({})) as { error?: { message?: string } };
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

export async function apiFetch<TRes = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<TRes> {
  const headers = buildHeaders(options.body, options.headers);
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    const newToken = await refreshOnce();
    if (!newToken) throw new ApiError(401, 'Unauthorized');

    headers['Authorization'] = `Bearer ${newToken}`;
    const retry = await fetch(url, { ...options, headers });
    if (!retry.ok) throw await parseError(retry);
    if (retry.status === 204) return undefined as TRes;
    return retry.json() as Promise<TRes>;
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as TRes;
  return res.json() as Promise<TRes>;
}
