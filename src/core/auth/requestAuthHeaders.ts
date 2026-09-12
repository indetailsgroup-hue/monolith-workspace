import { getSupabaseClient } from './supabaseClient';

const ANON_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
let sessionVersion = 0;
let sessionAllowed = true;
let currentActorId: string | null | undefined;

/** Invalidate pending lookups across identity changes; same-actor refresh is not a new identity. */
export function updateRequestAuthSession(actorId: string | null): void {
  if (currentActorId === actorId) return;
  sessionVersion += 1;
  sessionAllowed = actorId !== null;
  currentActorId = actorId;
}

/** The configured SDK session is the only bearer source; server authorization remains authoritative. */
export async function getRequestAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (ANON_KEY) headers.apikey = ANON_KEY;
  const observedVersion = sessionVersion;
  if (!sessionAllowed) return headers;
  try {
    const client = getSupabaseClient();
    if (!client) return headers;
    const { data, error } = await client.auth.getSession();
    if (!sessionAllowed || observedVersion !== sessionVersion) return headers;
    const session = data.session;
    if (error || !session) return headers;
    if (currentActorId && session.user?.id !== currentActorId) return headers;
    const token = session.access_token;
    if (typeof token !== 'string' || !token || /\s/.test(token)) return headers;
    if (session.expires_at !== undefined && (!Number.isFinite(session.expires_at) || session.expires_at * 1000 <= Date.now())) return headers;
    headers.Authorization = `Bearer ${token}`;
  } catch {
    // A failed lookup must not fall back to another account or the anon key.
  }
  return headers;
}
