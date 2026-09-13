import type { Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn(), signInWithPassword: vi.fn(), onAuthStateChange: vi.fn() }));
const configuration = vi.hoisted(() => ({ enabled: true }));
vi.mock('../supabaseClient', () => ({ getSupabaseClient: () => configuration.enabled ? { auth } : null }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const session = (id = 'actor-a') => ({ user: { id }, access_token: `fixture-${id}` } as Session);
type SessionResult = { data: { session: Session | null }; error?: Error };
let onChange: (event: string, value: Session | null) => void;

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  configuration.enabled = true;
  onChange = () => {};
  auth.getSession.mockReset().mockResolvedValue({ data: { session: session() }, error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  auth.signInWithPassword.mockReset();
  auth.onAuthStateChange.mockReset().mockImplementation((callback) => {
    onChange = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('configured session lifecycle', () => {
  it('does not restore a delayed initial session after explicit sign-out', async () => {
    const initial = deferred<SessionResult>();
    auth.getSession.mockReturnValue(initial.promise);
    const { useSessionStore } = await import('../useSessionStore');
    const loading = useSessionStore.getState().initialize();
    await useSessionStore.getState().signOut();
    initial.resolve({ data: { session: session() } });
    await loading;
    expect(useSessionStore.getState().session).toBeNull();
  });

  it.each(['SIGNED_OUT', 'SIGNED_IN'])('keeps a newer %s event over a delayed initial result', async (event) => {
    const initial = deferred<SessionResult>();
    auth.getSession.mockReturnValue(initial.promise);
    const { useSessionStore } = await import('../useSessionStore');
    const loading = useSessionStore.getState().initialize();
    const newer = event === 'SIGNED_OUT' ? null : session('actor-b');
    onChange(event, newer);
    initial.resolve({ data: { session: session() } });
    await loading;
    expect(useSessionStore.getState().session).toEqual(newer);
  });

  it('ignores a stale lookup rejection after a newer sign-in event', async () => {
    const initial = deferred<SessionResult>();
    auth.getSession.mockReturnValue(initial.promise);
    const { useSessionStore } = await import('../useSessionStore');
    const loading = useSessionStore.getState().initialize();
    onChange('SIGNED_IN', session('actor-b'));
    initial.reject(new Error('old lookup failed'));
    await expect(loading).resolves.toBeUndefined();
    expect(useSessionStore.getState().session?.user.id).toBe('actor-b');
  });

  it('clears stale tenant mirrors immediately on sign-out without removing project data', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { useTenantStore } = await import('../../../tenant/tenantStore');
    await useSessionStore.getState().initialize();
    useTenantStore.setState({ currentOrg: { orgId: 'org-a' } as never, currentMember: { userId: 'actor-a', orgId: 'org-a' } as never, userOrgs: [{ orgId: 'org-a' } as never] });
    localStorage.setItem('monolith-current-project', 'preserved-project');
    const remote = deferred<{ error: null }>();
    auth.signOut.mockReturnValue(remote.promise);
    const signingOut = useSessionStore.getState().signOut();
    expect(useSessionStore.getState().session).toBeNull();
    expect(useTenantStore.getState().currentOrg).toBeNull();
    expect(useTenantStore.getState().userOrgs).toEqual([]);
    expect(localStorage.getItem('monolith-current-project')).toBe('preserved-project');
    remote.resolve({ error: null });
    await signingOut;
  });

  it('clears another actor’s persisted tenant context but preserves the same actor on refresh', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { useTenantStore } = await import('../../../tenant/tenantStore');
    const org = { orgId: 'org-a' } as never;
    useTenantStore.setState({ currentOrg: org, currentMember: { userId: 'actor-a', orgId: 'org-a' } as never });
    await useSessionStore.getState().initialize();
    onChange('TOKEN_REFRESHED', session());
    expect(useTenantStore.getState().currentOrg).toBe(org);
    onChange('SIGNED_IN', session('actor-b'));
    expect(useTenantStore.getState().currentOrg).toBeNull();
    expect(useTenantStore.getState().currentMember).toBeNull();
  });

  it('does not restore a delayed sign-in result after sign-out', async () => {
    const pending = deferred<SessionResult>();
    auth.signInWithPassword.mockReturnValue(pending.promise);
    const { useSessionStore } = await import('../useSessionStore');
    const signingIn = useSessionStore.getState().signIn('fixture@example.invalid', 'fixture-password');
    await useSessionStore.getState().signOut();
    pending.resolve({ data: { session: session() } });
    expect((await signingIn).ok).toBe(false);
    expect(useSessionStore.getState().session).toBeNull();
  });

  it('allows the auth event emitted by the current sign-in operation', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    await useSessionStore.getState().initialize();
    const next = session('actor-b');
    auth.signInWithPassword.mockImplementation(async () => {
      onChange('SIGNED_IN', next);
      return { data: { session: next }, error: null };
    });
    expect(await useSessionStore.getState().signIn('fixture@example.invalid', 'fixture-password')).toEqual({ ok: true });
    expect(useSessionStore.getState().session).toBe(next);
  });

  it('clears stale presentation context when no configured auth client is available', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { useTenantStore } = await import('../../../tenant/tenantStore');
    useTenantStore.setState({ currentOrg: { orgId: 'org-a' } as never, currentMember: { userId: 'actor-a', orgId: 'org-a' } as never });
    useSessionStore.setState({ session: session() });
    configuration.enabled = false;
    await useSessionStore.getState().initialize();
    expect(useSessionStore.getState().session).toBeNull();
    expect(useTenantStore.getState().currentOrg).toBeNull();
  });

  it('keeps the local mirror signed out after remote sign-out fails', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { useTenantStore } = await import('../../../tenant/tenantStore');
    await useSessionStore.getState().initialize();
    useTenantStore.setState({ currentOrg: { orgId: 'org-a' } as never, currentMember: { userId: 'actor-a', orgId: 'org-a' } as never });
    auth.signOut.mockRejectedValue(new Error('remote unavailable'));
    await expect(useSessionStore.getState().signOut()).resolves.toBeUndefined();
    onChange('SIGNED_OUT', null);
    expect(useSessionStore.getState().session).toBeNull();
    expect(useTenantStore.getState().currentOrg).toBeNull();
  });

  it('ignores the SDK sign-in event from a canceled login while logout is pending', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    await useSessionStore.getState().initialize();
    const login = deferred<SessionResult>();
    const logout = deferred<{ error: null }>();
    auth.signInWithPassword.mockReturnValue(login.promise);
    auth.signOut.mockReturnValue(logout.promise);
    const signingIn = useSessionStore.getState().signIn('fixture@example.invalid', 'fixture-password');
    const signingOut = useSessionStore.getState().signOut();
    onChange('SIGNED_IN', session('actor-b'));
    expect(useSessionStore.getState().session).toBeNull();
    login.resolve({ data: { session: session('actor-b') } });
    expect((await signingIn).ok).toBe(false);
    logout.resolve({ error: null });
    await signingOut;
    expect(useSessionStore.getState().session).toBeNull();
  });

  it('accepts a new explicit login after local logout', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    await useSessionStore.getState().initialize();
    await useSessionStore.getState().signOut();
    const next = session('actor-b');
    auth.signInWithPassword.mockImplementation(async () => {
      onChange('SIGNED_IN', next);
      return { data: { session: next }, error: null };
    });
    expect(await useSessionStore.getState().signIn('fixture@example.invalid', 'fixture-password')).toEqual({ ok: true });
    expect(useSessionStore.getState().session).toBe(next);
  });

  it('continues sign-out when persisting the cleared tenant mirror fails', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { useTenantStore } = await import('../../../tenant/tenantStore');
    await useSessionStore.getState().initialize();
    useTenantStore.setState({ currentOrg: { orgId: 'org-a' } as never, currentMember: { userId: 'actor-a', orgId: 'org-a' } as never });
    const setItem = localStorage.setItem;
    const storageWrite = vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'monolith-tenant-store') throw new Error('storage denied');
      setItem.call(localStorage, key, value);
    });
    await expect(useSessionStore.getState().signOut()).resolves.toBeUndefined();
    expect(useSessionStore.getState().session).toBeNull();
    expect(useTenantStore.getState().currentOrg).toBeNull();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(storageWrite).toHaveBeenCalledWith('monolith-tenant-store', expect.any(String));
  });
});

describe('transport and local logout integration', () => {
  const callers = [
    ['state', async () => (await import('../../api/stateApi')).getJobState],
    ['factory JSON', async () => (await import('../../../factory/api/client')).apiFetch],
    ['factory blob', async () => (await import('../../../factory/api/client')).apiFetchBlob],
  ] as const;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
  });

  describe.each(['logout', 'actor switch', 'actor roundtrip'] as const)('%s next to dispatch', (change) => {
    it.each(callers)('keeps the %s bearer consistent with the identity at fetch invocation', async (_name, loadCaller) => {
      const { useSessionStore } = await import('../useSessionStore');
      await useSessionStore.getState().initialize();
      const call = await loadCaller();
      const lookup = deferred<SessionResult>();
      let changed = false;
      let changedAtDispatch = false;
      // Schedule the identity event immediately after the credential lookup continuation.
      // This exposes a gap between a helper returning headers and its caller invoking fetch.
      void lookup.promise.then(() => queueMicrotask(() => {
        if (change === 'logout') void useSessionStore.getState().signOut();
        else {
          onChange('SIGNED_IN', session('actor-b'));
          if (change === 'actor roundtrip') onChange('SIGNED_IN', session());
        }
        changed = true;
      }));
      auth.getSession.mockReturnValue(lookup.promise);
      vi.mocked(fetch).mockImplementation(async () => {
        changedAtDispatch = changed;
        return new Response('{}');
      });
      const request = call('/fixture');
      lookup.resolve({ data: { session: session() } });
      await request;
      expect(changed).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(1);
      const bearer = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization');
      expect(bearer).toBe(changedAtDispatch ? null : 'Bearer fixture-actor-a');
    });
  });

  it.each(callers)('does not send a delayed %s bearer after explicit logout', async (_name, loadCaller) => {
    const { useSessionStore } = await import('../useSessionStore');
    await useSessionStore.getState().initialize();
    const call = await loadCaller();
    const lookup = deferred<SessionResult>();
    const remote = deferred<{ error: null }>();
    auth.getSession.mockReturnValue(lookup.promise);
    auth.signOut.mockReturnValue(remote.promise);
    const request = call('/fixture');
    const signingOut = useSessionStore.getState().signOut();
    lookup.resolve({ data: { session: session() } });
    await request;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
    remote.resolve({ error: null });
    await signingOut;
  });

  it('omits the SDK bearer during pending logout and after remote logout failure', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    await useSessionStore.getState().initialize();
    const remote = deferred<{ error: null }>();
    auth.signOut.mockReturnValue(remote.promise);
    const signingOut = useSessionStore.getState().signOut();
    await apiFetch('/fixture');
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
    remote.reject(new Error('remote unavailable'));
    await signingOut;
    await apiFetch('/fixture');
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get('Authorization')).toBeNull();
  });

  it('uses the configured SDK bearer again after a successful new explicit login', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    await useSessionStore.getState().initialize();
    await useSessionStore.getState().signOut();
    const next = session('actor-b');
    auth.signInWithPassword.mockResolvedValue({ data: { session: next }, error: null });
    auth.getSession.mockResolvedValue({ data: { session: next }, error: null });
    expect(await useSessionStore.getState().signIn('fixture@example.invalid', 'fixture-password')).toEqual({ ok: true });
    await apiFetch('/fixture');
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fixture-actor-b');
  });

  it('does not send the previous actor’s delayed bearer across an accepted actor switch', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    await useSessionStore.getState().initialize();
    const lookup = deferred<SessionResult>();
    auth.getSession.mockReturnValue(lookup.promise);
    const request = apiFetch('/fixture');
    onChange('SIGNED_IN', session('actor-b'));
    lookup.resolve({ data: { session: session() } });
    await request;
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
  });

  it('omits an SDK bearer for another actor after a new actor is accepted', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    await useSessionStore.getState().initialize();
    onChange('SIGNED_IN', session('actor-b'));
    await apiFetch('/fixture');
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
  });

  it('uses the refreshed bearer when the SDK refreshes the same actor during lookup', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    await useSessionStore.getState().initialize();
    const refreshed = { ...session(), access_token: 'fixture-refreshed-actor-a' };
    auth.getSession.mockImplementation(async () => {
      onChange('TOKEN_REFRESHED', refreshed);
      return { data: { session: refreshed }, error: null };
    });
    await apiFetch('/fixture');
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fixture-refreshed-actor-a');
  });

  it('invalidates a pending bearer across logout and a new login by the same actor', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    await useSessionStore.getState().initialize();
    const lookup = deferred<SessionResult>();
    auth.getSession.mockReturnValue(lookup.promise);
    const request = apiFetch('/fixture');
    await useSessionStore.getState().signOut();
    auth.signInWithPassword.mockResolvedValue({ data: { session: session() }, error: null });
    await useSessionStore.getState().signIn('fixture@example.invalid', 'fixture-password');
    lookup.resolve({ data: { session: session() } });
    await request;
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
  });

  it('preserves the first API bearer when INITIAL_SESSION establishes the same actor during lookup', async () => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    const lookup = deferred<SessionResult>();
    auth.getSession.mockReturnValueOnce(lookup.promise);
    const request = apiFetch('/fixture');
    const initializing = useSessionStore.getState().initialize();
    onChange('INITIAL_SESSION', session());
    await initializing;
    lookup.resolve({ data: { session: session() } });
    await request;
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fixture-actor-a');
  });

  it.each(['actor-b', null])('omits the first API bearer when INITIAL_SESSION establishes %s instead', async (actorId) => {
    const { useSessionStore } = await import('../useSessionStore');
    const { apiFetch } = await import('../../../factory/api/client');
    const lookup = deferred<SessionResult>();
    auth.getSession.mockReturnValueOnce(lookup.promise);
    const request = apiFetch('/fixture');
    const initializing = useSessionStore.getState().initialize();
    onChange('INITIAL_SESSION', actorId ? session(actorId) : null);
    await initializing;
    lookup.resolve({ data: { session: session() } });
    await request;
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBeNull();
  });
});
