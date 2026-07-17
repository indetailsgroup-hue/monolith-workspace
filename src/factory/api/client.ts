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
const ANON_KEY = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

/** Attach the end-user JWT; the anon key is never used as a fallback identity. */
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (!ANON_KEY) return h;
  h["apikey"] = ANON_KEY;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const s = JSON.parse(localStorage.getItem(key) ?? "");
      if (s?.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now())) {
        h["Authorization"] = "Bearer " + s.access_token;
        break;
      }
    }
  } catch { /* no session */ }
  return h;
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
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
    headers: {
      ...authHeaders(),
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
