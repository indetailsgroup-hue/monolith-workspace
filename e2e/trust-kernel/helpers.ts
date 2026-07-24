/**
 * helpers.ts — shared fixtures for the Trust Kernel shadow E2E specs (plan Task 12
 * Step 1; design §16.3 transaction chaos, §17.1 Shadow Trust-Ready).
 *
 * These helpers drive the SOLE server release authority — the versioned `/v3/factory`
 * edge (migration 0182 release_revision) — under real caller bearer tokens. Two
 * DISTINCT authenticated humans are required (a freeze actor and a release approver);
 * SoD is enforced server-side, so the client never sends an actor role/name.
 *
 * Environment (key ids / endpoints only — never a private key, never a raw locator):
 *   E2E_BASE_URL              the app origin (playwright baseURL is used otherwise)
 *   E2E_SUPABASE_ANON_KEY     the anon apikey for the edge
 *   E2E_DESIGNER_A_JWT        bearer for the freeze actor (tenant 001, Site A)
 *   E2E_APPROVER_B_JWT        bearer for the release approver (tenant 001, Site A)
 *   E2E_TENANT_002_JWT        bearer for a tenant-002 member (coexistence/isolation)
 *
 * The helpers return status + stable §13 reason code only; no plaintext, no signed
 * URL, no raw storage locator ever crosses this boundary.
 */
import { expect, type APIRequestContext } from '@playwright/test';

export interface EdgeEnv {
  baseUrl: string;
  anonKey: string;
  designerAJwt: string;
  approverBJwt: string;
  tenant002Jwt: string;
}

/** Read the E2E environment; throws (fails the run) if a required value is missing. */
export function edgeEnv(): EdgeEnv {
  const need = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`missing required E2E env: ${k}`);
    return v;
  };
  return {
    baseUrl: process.env.E2E_BASE_URL || process.env.BASE_URL || 'http://localhost:5173',
    anonKey: need('E2E_SUPABASE_ANON_KEY'),
    designerAJwt: need('E2E_DESIGNER_A_JWT'),
    approverBJwt: need('E2E_APPROVER_B_JWT'),
    tenant002Jwt: need('E2E_TENANT_002_JWT'),
  };
}

function headers(env: EdgeEnv, bearer: string): Record<string, string> {
  // No X-Actor-Role / X-Actor-Name: the client is never an authority (design §7.1).
  return { apikey: env.anonKey, Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' };
}

export interface EdgeResult {
  status: number;
  ok: boolean;
  code?: string;
  body: Record<string, unknown>;
}

async function post(
  request: APIRequestContext,
  env: EdgeEnv,
  bearer: string,
  path: string,
  data: Record<string, unknown>,
): Promise<EdgeResult> {
  const res = await request.post(`${env.baseUrl}${path}`, { headers: headers(env, bearer), data });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status(), ok: res.ok(), code: body.code as string | undefined, body };
}

async function get(
  request: APIRequestContext,
  env: EdgeEnv,
  bearer: string,
  path: string,
): Promise<EdgeResult> {
  const res = await request.get(`${env.baseUrl}${path}`, { headers: headers(env, bearer) });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status(), ok: res.ok(), code: body.code as string | undefined, body };
}

/** Freeze a working revision as the designer (distinct from the approver). */
export function freezeAs(
  request: APIRequestContext,
  env: EdgeEnv,
  bearer: string,
  workingRevisionId: string,
  candidate: { candidateHash: string; snapshotHash: string },
): Promise<EdgeResult> {
  return post(request, env, bearer, `/v3/factory/jobs/${workingRevisionId}/freeze`, candidate);
}

/** Approve + release a candidate as a SECOND distinct human (four-eyes). */
export function approveAndReleaseAs(
  request: APIRequestContext,
  env: EdgeEnv,
  bearer: string,
  candidateId: string,
  authorization: { candidateHash: string; releaseAuthorizationHash: string; idempotencyKey: string; requestHash: string },
): Promise<EdgeResult> {
  return post(request, env, bearer, `/v3/factory/jobs/${candidateId}/release`, authorization);
}

/** Revoke an active release as the SAFETY_REVOKER. */
export function revokeAs(
  request: APIRequestContext,
  env: EdgeEnv,
  bearer: string,
  releaseRevisionId: string,
  reason: string,
): Promise<EdgeResult> {
  return post(request, env, bearer, `/v3/factory/jobs/${releaseRevisionId}/revoke`, { reason });
}

/** Read the server release-status projection (status + references only). */
export function releaseStatus(
  request: APIRequestContext,
  env: EdgeEnv,
  bearer: string,
  jobId: string,
): Promise<EdgeResult> {
  return get(request, env, bearer, `/v3/factory/jobs/${jobId}/status`);
}

/** Assert a job's release + artifact state through the projection. */
export async function expectReleaseState(
  request: APIRequestContext,
  env: EdgeEnv,
  jobId: string,
  releaseStatusExpected: string,
  artifactStatusExpected: string,
): Promise<void> {
  const res = await releaseStatus(request, env, env.approverBJwt, jobId);
  expect(res.status).toBe(200);
  expect(res.body.releaseStatus).toBe(releaseStatusExpected);
  expect(res.body.artifactStatus).toBe(artifactStatusExpected);
  // A projection never carries a locator / signed URL / plaintext.
  const serialized = JSON.stringify(res.body).toLowerCase();
  for (const banned of ['signedurl', 'sign?token', 'storagepath', 'plaintext', 'zipbase64']) {
    expect(serialized).not.toContain(banned);
  }
}

/**
 * A human's direct attempt to read the sealed P2 plaintext. Must be denied 403 with
 * STORE_PLAINTEXT_ACCESS_DENIED — a human never receives P2 bytes or a raw URL (§9).
 */
export async function expectHumanP2Request(
  request: APIRequestContext,
  env: EdgeEnv,
  jobId: string,
): Promise<{ status: number; code?: string }> {
  const res = await get(request, env, env.approverBJwt, `/v3/factory/jobs/${jobId}/plaintext`);
  return { status: res.status, code: res.code };
}
