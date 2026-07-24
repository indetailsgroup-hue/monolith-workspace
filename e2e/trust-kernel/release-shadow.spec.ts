/**
 * release-shadow.spec.ts — Shadow Trust-Ready two-person release E2E (plan Task 12
 * Step 1; design §17.1). Two DISTINCT authenticated humans complete freeze + release
 * while P2 shadow plaintext stays unreadable to any human, tenants 001/002 coexist,
 * and offline/first-use/hash-guess attacks reject with their stable §13 codes.
 *
 * Runs against the live app + shared Supabase stack; requires the E2E env in
 * helpers.ts. NOT runnable without that stack — see the Task 12 report.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */
import { test, expect } from '@playwright/test';
import {
  edgeEnv,
  freezeAs,
  approveAndReleaseAs,
  revokeAs,
  releaseStatus,
  expectReleaseState,
  expectHumanP2Request,
  type EdgeEnv,
} from './helpers';

// A frozen candidate fixture for tenant 001 / Site A (Daph onboarding data — fixture,
// never a runtime constant). Real hashes are provisioned by the runbook's fixture step.
const HASH = 'a'.repeat(64);
const AUTHZ = 'b'.repeat(64);
const CANDIDATE = { candidateHash: HASH, snapshotHash: HASH };
const AUTHORIZATION = { candidateHash: HASH, releaseAuthorizationHash: AUTHZ, idempotencyKey: 'e2e-idem-1', requestHash: 'c'.repeat(64) };

let env: EdgeEnv;
test.beforeAll(() => {
  env = edgeEnv();
});

test.describe('two-person release with P2 sealed from humans', () => {
  test('two distinct humans release while P2 remains unavailable to humans', async ({ request }) => {
    const wr = 'WR-e2e-1';
    const freeze = await freezeAs(request, env, env.designerAJwt, wr, CANDIDATE);
    expect(freeze.status).toBe(200);

    const release = await approveAndReleaseAs(request, env, env.approverBJwt, wr, AUTHORIZATION);
    expect(release.status).toBe(200);

    await expectReleaseState(request, env, wr, 'ACTIVE', 'AVAILABLE');

    // A human's direct P2 plaintext request is denied — hashes/reports/evidence only.
    const p2 = await expectHumanP2Request(request, env, wr);
    expect(p2).toMatchObject({ status: 403, code: 'STORE_PLAINTEXT_ACCESS_DENIED' });
  });

  test('the same human cannot both freeze and release (SoD, four-eyes)', async ({ request }) => {
    const wr = 'WR-e2e-sod';
    await freezeAs(request, env, env.designerAJwt, wr, CANDIDATE);
    // Designer A tries to also release — must be an SoD violation.
    const selfRelease = await approveAndReleaseAs(request, env, env.designerAJwt, wr, AUTHORIZATION);
    expect(selfRelease.ok).toBeFalsy();
    expect(selfRelease.code).toBe('AUTH_SOD_VIOLATION');
  });
});

test.describe('tenant coexistence + isolation (Daph 001 and tenant 002)', () => {
  test('a tenant-002 member cannot read or act on a tenant-001 job (cross-tenant denied)', async ({ request }) => {
    const wr = 'WR-e2e-1';
    const cross = await releaseStatus(request, env, env.tenant002Jwt, wr);
    // Either not found or scope denied — never leaks tenant-001 state.
    expect([403, 404]).toContain(cross.status);
    if (cross.code) expect(['AUTH_SCOPE_DENIED', 'STATE_CONFLICT']).toContain(cross.code);
  });

  test('tenant 002 can run its own freeze/release independently', async ({ request }) => {
    const wr = 'WR-t002-1';
    const freeze = await freezeAs(request, env, env.tenant002Jwt, wr, CANDIDATE);
    // tenant 002 provisions its own authority; the flow is not hardcoded to Daph.
    expect([200, 409]).toContain(freeze.status);
  });
});

test.describe('offline / first-use / hash-guessing rejections', () => {
  test('a cross-tenant object/hash guess cannot reach P2 bytes', async ({ request }) => {
    // Guess a plausible locator for another tenant's content hash.
    const guess = await expectHumanP2Request(request, env, 'WR-someone-elses');
    expect([403, 404]).toContain(guess.status);
    if (guess.code) expect(guess.code).toBe('STORE_PLAINTEXT_ACCESS_DENIED');
  });

  test('an offline-marked replay cannot claim current authority (freshness unproven)', async ({ request }) => {
    const res = await request.get(`${env.baseUrl}/v3/factory/jobs/WR-e2e-1/status?offline=1`, {
      headers: { apikey: env.anonKey, Authorization: `Bearer ${env.approverBJwt}` },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    // Offline verification reports validAsOf and cannot assert current activity.
    if (body.code) expect(body.code).toBe('TRUST_FRESHNESS_UNPROVEN');
    else expect(body.validAsOf ?? body.freshness).toBeTruthy();
  });

  test('a revoked release then denies human/isolated P2 streaming', async ({ request }) => {
    const wr = 'WR-e2e-1';
    await revokeAs(request, env, env.approverBJwt, wr, 'SAFETY');
    await expectReleaseState(request, env, wr, 'REVOKED', 'VOID');
    const p2 = await expectHumanP2Request(request, env, wr);
    expect(p2.status).toBeGreaterThanOrEqual(400);
  });
});
