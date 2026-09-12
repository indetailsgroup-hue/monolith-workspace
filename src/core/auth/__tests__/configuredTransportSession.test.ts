import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ getSession: vi.fn(), createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: auth.createClient }));

const validSession = () => ({ access_token: 'configured-session', expires_at: Date.now() / 1000 + 3600 });
const callers = [
  ['state', async () => (await import('../../api/stateApi')).getJobState('fixture-job')],
  ['factory JSON', async () => (await import('../../../factory/api/client')).apiFetch('/fixture')],
  ['factory blob', async () => (await import('../../../factory/api/client')).apiFetchBlob('/fixture')],
] as const;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://configured-project.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fixture-api-key');
  localStorage.clear();
  localStorage.setItem('sb-unrelated-project-auth-token', JSON.stringify({
    access_token: 'unrelated-session', expires_at: Date.now() / 1000 + 3600,
  }));
  auth.createClient.mockReset().mockReturnValue({ auth: { getSession: auth.getSession } });
  auth.getSession.mockReset().mockResolvedValue({ data: { session: validSession() }, error: null });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })));
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function sentHeaders() {
  expect(fetch).toHaveBeenCalledTimes(1);
  return new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers);
}

describe.each(callers)('%s configured session boundary', (_name, call) => {
  it('uses the configured client session rather than another stored Supabase token', async () => {
    await call();
    expect(auth.createClient).toHaveBeenCalledWith('https://configured-project.supabase.co', 'fixture-api-key', expect.any(Object));
    expect(sentHeaders().get('Authorization')).toBe('Bearer configured-session');
    expect(sentHeaders().get('apikey')).toBe('fixture-api-key');
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it.each(['expired', 'signed out', 'lookup error', 'lookup rejection', 'missing config', 'invalid config'])('sends no bearer for %s and never falls back to unrelated storage', async (failure) => {
    if (failure === 'expired') auth.getSession.mockResolvedValue({ data: { session: { ...validSession(), expires_at: 1 } }, error: null });
    if (failure === 'signed out') auth.getSession.mockResolvedValue({ data: { session: null }, error: null });
    if (failure === 'lookup error') auth.getSession.mockResolvedValue({ data: { session: validSession() }, error: new Error('lookup failed') });
    if (failure === 'lookup rejection') auth.getSession.mockRejectedValue(new Error('lookup failed'));
    if (failure === 'missing config') vi.stubEnv('VITE_SUPABASE_URL', '');
    if (failure === 'invalid config') auth.createClient.mockImplementation(() => { throw new Error('invalid config'); });
    await call();
    expect(sentHeaders().get('Authorization')).toBeNull();
  });
});

it.each(['JSON', 'blob'])('preserves extra %s headers while keeping session identity authoritative', async (kind) => {
  const { apiFetch, apiFetchBlob } = await import('../../../factory/api/client');
  const call = kind === 'JSON' ? apiFetch : apiFetchBlob;
  await call('/fixture', { headers: new Headers({ Accept: 'application/octet-stream', Authorization: 'Bearer unrelated-override', apikey: 'wrong-key' }) });
  expect(sentHeaders().get('Authorization')).toBe('Bearer configured-session');
  expect(sentHeaders().get('apikey')).toBe('fixture-api-key');
  expect(sentHeaders().get('Accept')).toBe('application/octet-stream');
});

describe('health probe deadline', () => {
  it('returns false after three seconds when configured session lookup never settles', async () => {
    const { isServerReachable } = await import('../../api/stateApi');
    vi.useFakeTimers();
    auth.getSession.mockReturnValue(new Promise(() => {}));
    let result: boolean | undefined;
    const probe = isServerReachable().then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(result).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    await probe;
  });

  it('does not dispatch a health request when session lookup completes after the deadline', async () => {
    const { isServerReachable } = await import('../../api/stateApi');
    vi.useFakeTimers();
    let resolveSession!: (value: unknown) => void;
    auth.getSession.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    let result: boolean | undefined;
    const probe = isServerReachable().then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(3000);
    expect(result).toBe(false);
    resolveSession({ data: { session: validSession() }, error: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();
    await probe;
  });

  it('still checks a responsive server with the configured session', async () => {
    const { isServerReachable } = await import('../../api/stateApi');
    expect(await isServerReachable()).toBe(true);
    expect(sentHeaders().get('Authorization')).toBe('Bearer configured-session');
  });
});
