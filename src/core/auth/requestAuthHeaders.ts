import { getSupabaseClient } from './supabaseClient';

const ANON_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
let sessionVersion = 0;
let sessionAllowed = true;
let currentActorId: string | null | undefined;

/** Invalidate pending lookups across identity changes; same-actor refresh is not a new identity. */
export function updateRequestAuthSession(actorId: string | null): void {
  if (currentActorId === actorId) return;
  // The first actor establishes context; the resolved SDK session must still match below.
  if (currentActorId !== undefined || actorId === null) sessionVersion += 1;
  sessionAllowed = actorId !== null;
  currentActorId = actorId;
}

/** Resolve the configured SDK identity and dispatch without an await after validation. */
export async function fetchWithRequestAuth(url: string, options?: RequestInit): Promise<Response> {
  const headers = new Headers(options?.headers);
  headers.delete('Authorization');
  headers.delete('apikey');
  if (ANON_KEY) headers.set('apikey', ANON_KEY);
  const observedVersion = sessionVersion;
  if (sessionAllowed && !options?.signal?.aborted) {
    try {
      const client = getSupabaseClient();
      const result = client ? await client.auth.getSession() : null;
      const session = result?.data.session;
      if (!result?.error && session && sessionAllowed && observedVersion === sessionVersion
        && (!currentActorId || session.user?.id === currentActorId)) {
        const token = session.access_token;
        const unexpired = session.expires_at === undefined
          || (Number.isFinite(session.expires_at) && session.expires_at * 1000 > Date.now());
        if (typeof token === 'string' && token && !/\s/.test(token) && unexpired) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      }
    } catch {
      // A failed lookup must not fall back to another account or the anon key.
    }
  }
  if (options?.signal?.aborted) throw new DOMException('The request was aborted', 'AbortError');
  // Keep this invocation synchronous with the identity checks above, including first-session matching.
  return fetch(url, { ...options, headers });
}
