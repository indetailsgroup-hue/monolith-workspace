/** @vitest-environment jsdom */

import 'fake-indexeddb/auto';
import { Blob as NodeBlob } from 'node:buffer';
import type { Session } from '@supabase/supabase-js';
import type { ZipBundleResult } from '../../../factory/packet/zipBundle';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Keep the project/session stores, export orchestration, packet upload and
// request-header lookup real. Only SDK, network and packet production are fakes.
const sdk = vi.hoisted(() => ({
  createClient: vi.fn(), getSession: vi.fn(), signOut: vi.fn(), onAuthStateChange: vi.fn(),
}));
const packet = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: sdk.createClient }));
vi.mock('../../../factory/packet', () => ({ generateFactoryPacketFromStores: packet.generate }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const actorA = (): Session => ({
  user: { id: 'combined-actor-a' }, access_token: 'configured-actor-a',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
} as Session);

type SessionResult = { data: { session: Session | null }; error: null };
type ProjectStore = typeof import('../../../core/store/useProjectStore').useProjectStore;
type CabinetStore = typeof import('../../../core/store/useCabinetStore').useCabinetStore;
type SessionStore = typeof import('../../../core/auth/useSessionStore').useSessionStore;
let projects: ProjectStore;
let cabinets: CabinetStore;
let sessions: SessionStore;
let exportPacket: typeof import('../exportFactoryPacketWithToasts').exportFactoryPacketWithToasts;

function generatedPacket(content: string): ZipBundleResult {
  return {
    // This is an opaque packet fixture, not validation of ZIP generation.
    blob: new Blob([content], { type: 'application/zip' }),
    filename: 'combined-fixture.zip', compressedSize: content.length,
    uncompressedSize: content.length,
  } as ZipBundleResult;
}

function saveProject(name: string, width: number) {
  projects.getState().newProject(name);
  cabinets.getState().setDimension('width', width);
  projects.getState().saveProject();
  return {
    projectId: projects.getState().metadata!.id,
    cabinetId: cabinets.getState().cabinet!.id,
    width,
  };
}

function saveTwoProjects() {
  const a = saveProject('Saved project A', 810);
  const b = saveProject('Saved project B', 920);
  expect(a.projectId).not.toBe(b.projectId);
  expect(projects.getState().loadProject(a.projectId)).toBe(true);
  return { a, b };
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  vi.stubGlobal('Blob', NodeBlob); // jsdom Blob lacks arrayBuffer; use the real Node implementation.
  vi.stubEnv('VITE_SUPABASE_URL', 'https://configured-combined.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'combined-api-key');
  vi.stubEnv('VITE_FACTORY_API_BASE', 'https://factory.example.invalid');
  localStorage.setItem('sb-unrelated-auth-token', JSON.stringify({
    access_token: 'unrelated-actor-b', expires_at: Date.now() / 1000 + 3600,
  }));
  sdk.getSession.mockReset().mockResolvedValue({ data: { session: actorA() }, error: null });
  sdk.signOut.mockReset().mockResolvedValue({ error: null });
  sdk.onAuthStateChange.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  sdk.createClient.mockReset().mockReturnValue({ auth: {
    getSession: sdk.getSession, signOut: sdk.signOut, onAuthStateChange: sdk.onAuthStateChange,
  } });
  packet.generate.mockReset();
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const hasSession = new Headers(init?.headers).get('Authorization') === 'Bearer configured-actor-a';
    return new Response(JSON.stringify(hasSession
      ? { ok: true, packetSha256: 'fixture-sha', storagePath: 'fixture-packet' }
      : { ok: false, error: 'No session' }), {
      status: hasSession ? 200 : 401, headers: { 'Content-Type': 'application/json' },
    });
  }));

  ({ useProjectStore: projects } = await import('../../../core/store/useProjectStore'));
  ({ useCabinetStore: cabinets } = await import('../../../core/store/useCabinetStore'));
  ({ useSessionStore: sessions } = await import('../../../core/auth/useSessionStore'));
  ({ exportFactoryPacketWithToasts: exportPacket } = await import('../exportFactoryPacketWithToasts'));
  projects.getState().setAutoSave(false);
  projects.setState({ metadata: null, savedProjects: [], isDirty: false, lastSaved: null });
  cabinets.setState({ cabinet: null, cabinets: [], activeCabinetId: null, selectedPanelId: null });
  await sessions.getState().initialize();
  packet.generate.mockImplementation(async () => generatedPacket(JSON.stringify({
    projectId: projects.getState().metadata?.id,
    cabinetId: cabinets.getState().cabinet?.id,
    width: cabinets.getState().cabinet?.dimensions.width,
  })));
});

afterEach(() => {
  projects?.getState().setAutoSave(false);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('combined saved project, export and configured session boundaries', () => {
  it('exports the reloaded A scene to A’s job with the configured A bearer', async () => {
    const { a } = saveTwoProjects();
    expect(await exportPacket()).toEqual({ ok: true, uploaded: true });
    expect(packet.generate).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe(`https://factory.example.invalid/api/factory/jobs/${encodeURIComponent(a.projectId)}/packet`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer configured-actor-a');
    expect(new Headers(init?.headers).get('apikey')).toBe('combined-api-key');
    const body = JSON.parse(init?.body as string);
    expect(JSON.parse(atob(body.zipBase64))).toEqual({ projectId: a.projectId, cabinetId: a.cabinetId, width: a.width });
    expect(sdk.createClient).toHaveBeenCalledWith('https://configured-combined.supabase.co', 'combined-api-key', expect.any(Object));
  });

  it('does not upload when the real selected project changes A to B to A during packet generation', async () => {
    const { a, b } = saveTwoProjects();
    const started = deferred<void>();
    const finished = deferred<ZipBundleResult>();
    packet.generate.mockImplementation(() => { started.resolve(); return finished.promise; });
    const exporting = exportPacket();
    await started.promise;
    expect(projects.getState().loadProject(b.projectId)).toBe(true);
    expect(projects.getState().loadProject(a.projectId)).toBe(true);
    finished.resolve(generatedPacket('packet already generated for A'));
    expect(await exporting).toEqual({ ok: true, uploaded: false });
    expect(projects.getState().metadata?.id).toBe(a.projectId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not send the old bearer when logout occurs during the real upload credential lookup', async () => {
    const { a } = saveTwoProjects();
    const lookupStarted = deferred<void>();
    const lookup = deferred<SessionResult>();
    const remoteLogout = deferred<{ error: null }>();
    sdk.getSession.mockImplementation(() => { lookupStarted.resolve(); return lookup.promise; });
    sdk.signOut.mockReturnValue(remoteLogout.promise);
    const exporting = exportPacket();
    await lookupStarted.promise;
    const signingOut = sessions.getState().signOut();
    expect(sessions.getState().session).toBeNull();
    lookup.resolve({ data: { session: actorA() }, error: null });
    expect(await exporting).toEqual({ ok: true, uploaded: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toContain(`/jobs/${encodeURIComponent(a.projectId)}/packet`);
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    remoteLogout.resolve({ error: null });
    await signingOut;
  });

  it('reloads the actual saved A and B scenes after logout and loss of in-memory project state', async () => {
    const { a, b } = saveTwoProjects();
    const { useTenantStore } = await import('../../../tenant/tenantStore');
    useTenantStore.setState({
      currentOrg: { orgId: 'combined-org-a' } as never,
      currentMember: { userId: 'combined-actor-a', orgId: 'combined-org-a' } as never,
    });
    await sessions.getState().signOut();
    expect(sessions.getState().session).toBeNull();
    expect(useTenantStore.getState().currentOrg).toBeNull();
    expect(useTenantStore.getState().currentMember).toBeNull();
    projects.setState({ metadata: null, savedProjects: [] });
    cabinets.setState({ cabinet: null, cabinets: [], activeCabinetId: null });
    for (const saved of [a, b]) {
      expect(projects.getState().loadProject(saved.projectId)).toBe(true);
      expect(projects.getState().metadata?.id).toBe(saved.projectId);
      expect(cabinets.getState().cabinet?.id).toBe(saved.cabinetId);
      expect(cabinets.getState().activeCabinetId).toBe(saved.cabinetId);
      expect(cabinets.getState().cabinet?.dimensions.width).toBe(saved.width);
      expect(cabinets.getState().cabinets.map((cabinet) => cabinet.id)).toEqual([saved.cabinetId]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
