/**
 * Factory API Client
 * Priority 2: Wire to real backend
 *
 * Centralized fetch with error mapping and header access
 */

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

const BASE_URL = import.meta.env?.VITE_FACTORY_API_BASE ?? "/api";
import { getRequestAuthHeaders } from '../../core/auth/requestAuthHeaders';

async function requestHeaders(extra?: HeadersInit, json = false): Promise<Headers> {
  const headers = new Headers(extra);
  headers.delete('Authorization');
  headers.delete('apikey');
  if (json && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  for (const [name, value] of Object.entries(await getRequestAuthHeaders())) headers.set(name, value);
  return headers;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: await requestHeaders(options?.headers, true),
  });

  if (!res.ok) {
    const err: ApiError = new Error(`API ${res.status}`);
    err.status = res.status;
    try {
      const body = await res.json();
      err.code = body?.code;
      err.message = body?.reason ?? err.message;
    } catch {
      // ignore parse error
    }
    throw err;
  }

  const headers = res.headers;
  const data = (await res.json()) as T;
  return { data, headers };
}

/**
 * Fetch blob (for ZIP download)
 */
export async function apiFetchBlob(
  path: string,
  options?: RequestInit
): Promise<{ blob: Blob; headers: Headers }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: await requestHeaders(options?.headers),
  });

  if (!res.ok) {
    const err: ApiError = new Error(`API ${res.status}`);
    err.status = res.status;
    try {
      const body = await res.json();
      err.code = body?.code;
      err.message = body?.reason ?? err.message;
    } catch {
      // ignore parse error
    }
    throw err;
  }

  const headers = res.headers;
  const blob = await res.blob();
  return { blob, headers };
}
