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

const BASE_URL = (import.meta as any).env?.VITE_FACTORY_API_BASE ?? "/api";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
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
    credentials: "include",
    headers: {
      ...(options?.headers ?? {}),
    },
    ...options,
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
