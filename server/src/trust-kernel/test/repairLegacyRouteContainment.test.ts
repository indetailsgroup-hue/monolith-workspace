// Feature: repair-intelligence-phase0 — legacy artifact byte-route containment
// (Task 6). The legacy signed-URL download and the direct /artifacts/:sha256
// GET/HEAD byte routes are blocked BY DEFAULT with 423 REPAIR_PHASE_NOT_ENABLED
// before any verification or CAS access. Only an explicit
// legacyAccessMode: 'SHADOW_LEGACY' dependency injection (tests/shadow) reaches
// the pre-existing behavior; the default server bootstrap never passes it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { artifactsRouter, type ArtifactsRouterDeps } from '../../api/routes/artifacts.js';
import { factoryRouter } from '../../api/routes/factory.js';
import { exportsRouter } from '../../api/routes/exports.js';
import type { CAS } from '../../storage/cas.js';

const SHA = 'a'.repeat(64);

function casSpy(): { cas: CAS; calls: { getBytes: number; hasHash: number } } {
  const calls = { getBytes: 0, hasHash: 0 };
  const cas = {
    getBytes: async () => { calls.getBytes += 1; return Buffer.from('bytes'); },
    hasHash: async () => { calls.hasHash += 1; return true; },
  } as unknown as CAS;
  return { cas, calls };
}

type Handler = (req: unknown, res: unknown) => Promise<unknown> | unknown;

/** Extract a concrete route handler from the Express router (no HTTP server). */
type ExpressRouter = { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }> };

function handlerOf(router: unknown, method: 'get' | 'head', path: string): Handler {
  const layer = (router as ExpressRouter).stack.find((l) => l.route?.path === path && l.route.methods[method] === true);
  if (!layer?.route) throw new Error(`route ${method.toUpperCase()} ${path} not found`);
  return layer.route.stack[0].handle;
}

function routeHandler(deps: ArtifactsRouterDeps, method: 'get' | 'head', path: string): Handler {
  return handlerOf(artifactsRouter(deps), method, path);
}

interface CapturedResponse {
  statusCode: number | null;
  body: Record<string, unknown> | null;
  ended: boolean;
}

function fakeRes(): { res: unknown; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: null, body: null, ended: false };
  const res = {
    status(code: number) { captured.statusCode = code; return this; },
    json(body: Record<string, unknown>) { captured.body = body; captured.ended = true; return this; },
    setHeader() { return this; },
    send() { captured.ended = true; return this; },
    end() { captured.ended = true; return this; },
  };
  return { res, captured };
}

describe('Repair Phase 0 legacy byte-route containment', () => {
  it('blocks GET /download by default before verification or CAS access', async () => {
    const { cas, calls } = casSpy();
    const handler = routeHandler({ cas }, 'get', '/download');
    const { res, captured } = fakeRes();
    await handler({ query: { sha256: SHA, exp: '9999999999', mime: 'application/pdf', fn: 'a.pdf', sig: 'deadbeef' } }, res);
    expect(captured.statusCode).toBe(423);
    expect(captured.body?.code).toBe('REPAIR_PHASE_NOT_ENABLED');
    expect(calls.getBytes).toBe(0);
  });

  it('blocks GET /artifacts/:sha256 by default before CAS access', async () => {
    const { cas, calls } = casSpy();
    const handler = routeHandler({ cas }, 'get', '/artifacts/:sha256');
    const { res, captured } = fakeRes();
    await handler({ params: { sha256: SHA } }, res);
    expect(captured.statusCode).toBe(423);
    expect(captured.body?.code).toBe('REPAIR_PHASE_NOT_ENABLED');
    expect(calls.getBytes).toBe(0);
  });

  it('blocks HEAD /artifacts/:sha256 by default before CAS access', async () => {
    const { cas, calls } = casSpy();
    const handler = routeHandler({ cas }, 'head', '/artifacts/:sha256');
    const { res, captured } = fakeRes();
    await handler({ params: { sha256: SHA } }, res);
    expect(captured.statusCode).toBe(423);
    expect(calls.hasHash).toBe(0);
  });

  it('default construction (no legacyAccessMode) is blocked — PHASE0_BLOCKED is the default', async () => {
    const { cas } = casSpy();
    const handler = routeHandler({ cas }, 'get', '/artifacts/:sha256');
    const { res, captured } = fakeRes();
    await handler({ params: { sha256: SHA } }, res);
    expect(captured.statusCode).toBe(423);
  });

  it('only explicit SHADOW_LEGACY reaches the pre-existing behavior (unit scope only)', async () => {
    const { cas, calls } = casSpy();
    const handler = routeHandler({ cas, legacyAccessMode: 'SHADOW_LEGACY' }, 'get', '/artifacts/:sha256');
    const { res, captured } = fakeRes();
    await handler({ params: { sha256: SHA } }, res);
    expect(captured.statusCode).toBeNull(); // res.send path: no status() call means implicit 200
    expect(captured.ended).toBe(true);
    expect(calls.getBytes).toBe(1);
  });

  it('the default server bootstrap never passes SHADOW_LEGACY', () => {
    const bootstrap = readFileSync(new URL('../../api/index.ts', import.meta.url), 'utf8');
    expect(bootstrap).toContain('artifactsRouter({ cas })');
    expect(bootstrap.includes('SHADOW_LEGACY')).toBe(false);
  });
});

describe('Repair Phase 0 sibling export byte-route containment (review #2)', () => {
  it('factory export-download is blocked by default before CAS access', async () => {
    const { cas, calls } = casSpy();
    const handler = handlerOf(factoryRouter({ cas }), 'get', '/jobs/:jobId/export/:exportId/download');
    const { res, captured } = fakeRes();
    await handler({ params: { jobId: 'JOB-1', exportId: 'E1' } }, res);
    expect(captured.statusCode).toBe(423);
    expect(captured.body?.code).toBe('REPAIR_PHASE_NOT_ENABLED');
    expect(calls.getBytes).toBe(0);
  });

  it('factory export-download reaches legacy behavior only under explicit SHADOW_LEGACY', async () => {
    const { cas } = casSpy();
    const handler = handlerOf(factoryRouter({ cas, legacyAccessMode: 'SHADOW_LEGACY' }), 'get', '/jobs/:jobId/export/:exportId/download');
    const { res, captured } = fakeRes();
    await handler({ params: { jobId: 'not a valid id!!', exportId: 'E1' } }, res);
    // Past the guard: it now runs real validation and rejects the bad id (400), not 423.
    expect(captured.statusCode).toBe(400);
  });

  it('exports /:jobId/result signed-URL route is blocked by default', async () => {
    const { cas } = casSpy();
    const handler = handlerOf(exportsRouter({ cas }), 'get', '/:jobId/result');
    const { res, captured } = fakeRes();
    await handler({ params: { jobId: 'JOB-1' } }, res);
    expect(captured.statusCode).toBe(423);
    expect(captured.body?.code).toBe('REPAIR_PHASE_NOT_ENABLED');
  });

  it('the API bootstrap mounts factory and exports routers without SHADOW_LEGACY', () => {
    const bootstrap = readFileSync(new URL('../../api/index.ts', import.meta.url), 'utf8');
    expect(bootstrap).toContain('factoryRouter({ cas })');
    expect(bootstrap).toContain('exportsRouter({ cas })');
    expect(bootstrap.includes('SHADOW_LEGACY')).toBe(false);
  });

  it('the standalone server never passes SHADOW_LEGACY to its byte route', () => {
    const standalone = readFileSync(new URL('../../index.ts', import.meta.url), 'utf8');
    expect(standalone).toContain("LEGACY_BYTE_ROUTE_MODE: LegacyAccessMode = 'PHASE0_BLOCKED'");
    expect(standalone).toContain('phase0LegacyBlocked(LEGACY_BYTE_ROUTE_MODE, res)');
  });
});
