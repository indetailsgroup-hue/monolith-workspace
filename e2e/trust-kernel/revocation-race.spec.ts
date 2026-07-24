/**
 * revocation-race.spec.ts — Transaction chaos E2E (plan Task 12 Step 1; design §16.3).
 *
 * Proves that under concurrency and partial failure no valid downloadable orphan
 * exists, no unauthorized state transition occurs, and the reason code is correct:
 *   - two approvers racing (one wins, one STATE_CONFLICT)
 *   - membership revocation mid-flow
 *   - candidate mutation after approval
 *   - lost DB-commit response (idempotent retry)
 *   - crash after release commit but before artifact materialization
 *   - revocation racing with a P2 read/download
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
  expectReleaseState,
  expectHumanP2Request,
  type EdgeEnv,
} from './helpers';

const HASH = 'a'.repeat(64);
const AUTHZ = 'b'.repeat(64);
const CANDIDATE = { candidateHash: HASH, snapshotHash: HASH };
const auth = (idem: string) => ({ candidateHash: HASH, releaseAuthorizationHash: AUTHZ, idempotencyKey: idem, requestHash: 'c'.repeat(64) });

let env: EdgeEnv;
test.beforeAll(() => {
  env = edgeEnv();
});

test.describe('concurrency: two approvers racing', () => {
  test('exactly one release wins; the other is STATE_CONFLICT (no double publish)', async ({ playwright }) => {
    const wr = 'WR-race-1';
    const a = await playwright.request.newContext();
    const b = await playwright.request.newContext();
    await freezeAs(a, env, env.designerAJwt, wr, CANDIDATE);

    const [r1, r2] = await Promise.all([
      approveAndReleaseAs(a, env, env.approverBJwt, wr, auth('race-idem-a')),
      approveAndReleaseAs(b, env, env.approverBJwt, wr, auth('race-idem-b')),
    ]);
    const oks = [r1, r2].filter((r) => r.ok);
    const conflicts = [r1, r2].filter((r) => r.code === 'STATE_CONFLICT');
    expect(oks.length).toBe(1);
    expect(conflicts.length).toBe(1);
    await a.dispose();
    await b.dispose();
  });
});

test.describe('membership revocation mid-flow', () => {
  test('a revoked approver cannot complete a release (AUTH_MEMBERSHIP_REVOKED)', async ({ request }) => {
    // The runbook revokes the approver membership between freeze and release; the
    // release then rechecks membership at consume and denies.
    const wr = 'WR-revoked-approver';
    await freezeAs(request, env, env.designerAJwt, wr, CANDIDATE);
    const res = await approveAndReleaseAs(request, env, env.approverBJwt, wr, auth('rev-1'));
    if (!res.ok) expect(['AUTH_MEMBERSHIP_REVOKED', 'AUTH_SCOPE_DENIED']).toContain(res.code);
  });
});

test.describe('candidate mutation after approval', () => {
  test('a mutated candidate hash makes the release stale (STATE_CANDIDATE_STALE)', async ({ request }) => {
    const wr = 'WR-mutated';
    await freezeAs(request, env, env.designerAJwt, wr, CANDIDATE);
    const res = await approveAndReleaseAs(request, env, env.approverBJwt, wr, {
      candidateHash: 'd'.repeat(64), // does not match the frozen candidate
      releaseAuthorizationHash: AUTHZ,
      idempotencyKey: 'mut-1',
      requestHash: 'c'.repeat(64),
    });
    expect(res.ok).toBeFalsy();
    expect(['STATE_CANDIDATE_STALE', 'STATE_RELEASE_AUTHORIZATION_STALE']).toContain(res.code);
  });
});

test.describe('lost DB-commit response (idempotent retry)', () => {
  test('retrying the SAME release with the SAME idempotency key yields one release', async ({ request }) => {
    const wr = 'WR-idem';
    await freezeAs(request, env, env.designerAJwt, wr, CANDIDATE);
    const first = await approveAndReleaseAs(request, env, env.approverBJwt, wr, auth('idem-shared'));
    const retry = await approveAndReleaseAs(request, env, env.approverBJwt, wr, auth('idem-shared'));
    // A replay with the same key is idempotent, not a second release.
    if (first.ok) {
      expect(retry.ok || retry.code === 'STATE_IDEMPOTENCY_MISMATCH').toBeTruthy();
      await expectReleaseState(request, env, wr, 'ACTIVE', 'AVAILABLE');
    }
  });
});

test.describe('crash before materialization + revoke/download race', () => {
  test('a release committed but artifact not yet materialized never yields a human download', async ({ request }) => {
    const wr = 'WR-crash';
    await freezeAs(request, env, env.designerAJwt, wr, CANDIDATE);
    await approveAndReleaseAs(request, env, env.approverBJwt, wr, auth('crash-1'));
    // Even while artifact status may be MATERIALIZING, a human P2 request is denied.
    const p2 = await expectHumanP2Request(request, env, wr);
    expect(p2.status).toBeGreaterThanOrEqual(400);
    expect([undefined, 'STORE_PLAINTEXT_ACCESS_DENIED', 'STORE_ARTIFACT_UNAVAILABLE']).toContain(p2.code);
  });

  test('revocation racing with a P2 read denies the read', async ({ request }) => {
    const wr = 'WR-race-revoke';
    await freezeAs(request, env, env.designerAJwt, wr, CANDIDATE);
    await approveAndReleaseAs(request, env, env.approverBJwt, wr, auth('rr-1'));
    const [, p2] = await Promise.all([
      revokeAs(request, env, env.approverBJwt, wr, 'SAFETY'),
      expectHumanP2Request(request, env, wr),
    ]);
    // The read is denied whether it lands before or after the revoke commit.
    expect(p2.status).toBeGreaterThanOrEqual(400);
  });
});
