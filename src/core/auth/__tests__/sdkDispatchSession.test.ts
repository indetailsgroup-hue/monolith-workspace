/** @vitest-environment node */

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const configured = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock('../supabaseClient', () => ({ getSupabaseClient: () => configured.client }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function session(id: string): Session {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const payload = btoa(JSON.stringify({ sub: id, exp: expiresAt })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return {
    user: { id, email: `${id}@fixture.invalid` },
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.c2ln`,
    refresh_token: `fixture-refresh-${id}`, expires_at: expiresAt,
    expires_in: 3600, token_type: 'bearer',
  } as Session;
}

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(async () => {
  await configured.client?.auth.stopAutoRefresh();
  vi.unstubAllGlobals();
});

it.each([4, 5].flatMap((turns) => ['JSON', 'blob'].map((kind) => [kind, turns] as const)))('keeps the %s request identity consistent after %s SDK continuations', async (kind, turns) => {
  const actorA = session('actor-a');
  const actorB = session('actor-b');
  const storage = new Map([['fixture-sdk-dispatch', JSON.stringify(actorA)]]);
  const loginResponse = deferred<Response>();
  // Only the network is replaced: SDK storage, getSession, signIn and auth events run normally.
  configured.client = createClient('https://fixture.invalid', 'fixture-api-key', {
    global: { fetch: () => loginResponse.promise },
    auth: {
      storageKey: 'fixture-sdk-dispatch', autoRefreshToken: false,
      detectSessionInUrl: false, persistSession: true,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => { storage.set(key, value); },
        removeItem: (key) => { storage.delete(key); },
      },
    },
  });
  const initial = deferred<void>();
  configured.client.auth.onAuthStateChange((event) => {
    if (event === 'INITIAL_SESSION') initial.resolve();
  });
  const { useSessionStore } = await import('../useSessionStore');
  const { apiFetch, apiFetchBlob } = await import('../../../factory/api/client');
  await useSessionStore.getState().initialize();
  await initial.promise;
  let actorAtDispatch: string | undefined;
  vi.stubGlobal('fetch', vi.fn(async () => {
    actorAtDispatch = useSessionStore.getState().session?.user.id;
    return new Response('{}');
  }));

  const login = useSessionStore.getState().signIn('actor-b@fixture.invalid', 'fixture-password');
  loginResponse.resolve(new Response(JSON.stringify(actorB), { headers: { 'Content-Type': 'application/json' } }));
  // Exercise the two adjacent microtask orders that overlap SDK persistence/notification
  // with credential resolution. No elapsed-time delay or manually emitted auth event is used.
  for (let step = 0; step < turns; step++) await Promise.resolve();
  const request = (kind === 'JSON' ? apiFetch : apiFetchBlob)('/fixture');
  await Promise.all([login, request]);

  expect(useSessionStore.getState().session?.user.id).toBe('actor-b');
  expect(fetch).toHaveBeenCalledTimes(1);
  const bearer = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization');
  // Dispatch before the switch may use A; dispatch after the switch must not use A.
  expect(bearer).toBe(actorAtDispatch === 'actor-a' ? `Bearer ${actorA.access_token}` : null);
});
