/**
 * trustKernelApi.ts — client for the V3 Production Trust Kernel authority
 * (plan Task 11; design §7.2 verified-action-context, §10 release choreography).
 *
 * This is the ONLY sanctioned client authority path. It sends bearer-authorized
 * candidate/release/revoke INTENTS to the versioned `/v3/factory` edge surface and
 * NEVER sends an actor role or name — a client-supplied role can never be authority
 * (design §7.1). Responses are rendered as server PROJECTIONS (status + reason
 * codes only); a raw locator, signed URL, or plaintext is never surfaced.
 *
 * Phase: NOT_FOR_PRODUCTION.
 */

import {
  projectFactoryPacketStatus,
  type FactoryPacketProjection,
} from '../../factory/packet/trustKernelProjection';

// ============================================
// CONFIGURATION
// ============================================

const API_BASE = (import.meta.env?.VITE_FACTORY_API_BASE as string | undefined) ?? '';
const ANON_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export type IntentAction = 'freeze' | 'release' | 'revoke';

/**
 * Per-action request-body allow-lists. Anything not listed — actor role/name,
 * tenant/site, or any spoof field — is dropped before the request is built. This
 * mirrors the edge's `filterActionBody`; containment holds on both sides.
 */
const ALLOWED_BODY_FIELDS: Readonly<Record<IntentAction, readonly string[]>> = {
  freeze: [
    'candidateHash',
    'snapshotHash',
    'gateInputsHash',
    'machineProfileHash',
    'attestationId',
    'attestationHash',
    'policyVersion',
    'requestHash',
  ],
  release: ['candidateHash', 'releaseAuthorizationHash', 'idempotencyKey', 'requestHash'],
  revoke: ['reason'],
};

export interface IntentAuth {
  /** The caller's user bearer token (e.g. "Bearer eyJ..."), never a service key. */
  bearer: string;
  /** The Supabase anon apikey, required when calling the edge function directly. */
  apikey?: string;
}

export interface BuiltIntentRequest {
  url: string;
  method: 'POST' | 'GET';
  headers: Record<string, string>;
  body: string;
}

/**
 * Build a V3 authority-intent request. Pure and side-effect-free so containment is
 * unit-testable: the headers never carry `x-actor-*` and the body carries only the
 * action's allow-listed hashes.
 */
export function buildIntentRequest(
  action: IntentAction,
  jobId: string,
  payload: Record<string, unknown>,
  auth: IntentAuth,
): BuiltIntentRequest {
  const body: Record<string, string> = {};
  for (const key of ALLOWED_BODY_FIELDS[action]) {
    const v = payload?.[key];
    if (typeof v === 'string') body[key] = v;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: auth.bearer,
  };
  if (auth.apikey) headers.apikey = auth.apikey;
  return {
    url: `${API_BASE}/v3/factory/jobs/${encodeURIComponent(jobId)}/${action}`,
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  };
}

/** Read the current Field App session bearer (ADR-058); anon key as apikey. */
function resolveAuth(): IntentAuth {
  let bearer = ANON_KEY ? `Bearer ${ANON_KEY}` : '';
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const s = JSON.parse(localStorage.getItem(key) ?? '');
      if (s?.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now())) {
        bearer = `Bearer ${s.access_token}`;
        break;
      }
    }
  } catch {
    /* no session */
  }
  return { bearer, apikey: ANON_KEY || undefined };
}

/** Response envelope the client renders — server projection only. */
export interface IntentResult {
  ok: boolean;
  httpStatus: number;
  reason?: string;
  projection?: FactoryPacketProjection;
  error?: string;
}

async function sendIntent(action: IntentAction, jobId: string, payload: Record<string, unknown>): Promise<IntentResult> {
  const built = buildIntentRequest(action, jobId, payload, resolveAuth());
  try {
    const res = await fetch(built.url, { method: built.method, headers: built.headers, body: built.body });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: res.ok,
      httpStatus: res.status,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
      projection: projectFactoryPacketStatus(raw),
    };
  } catch (error) {
    return { ok: false, httpStatus: 0, error: error instanceof Error ? error.message : 'Network error' };
  }
}

/** Submit a bearer-authorized FREEZE (candidate) intent. */
export function submitFreezeIntent(workingRevisionId: string, payload: Record<string, unknown> = {}): Promise<IntentResult> {
  return sendIntent('freeze', workingRevisionId, payload);
}

/** Submit a bearer-authorized RELEASE intent. */
export function submitReleaseIntent(candidateJobId: string, payload: Record<string, unknown> = {}): Promise<IntentResult> {
  return sendIntent('release', candidateJobId, payload);
}

/** Submit a bearer-authorized REVOKE intent (reason only). */
export function submitRevokeIntent(releaseRevisionId: string, reason: string): Promise<IntentResult> {
  return sendIntent('revoke', releaseRevisionId, { reason });
}

/** GET the release-status projection (status + references only, never a locator). */
export async function getReleaseStatus(releaseRevisionId: string): Promise<IntentResult> {
  const auth = resolveAuth();
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Authorization: auth.bearer };
  if (auth.apikey) headers.apikey = auth.apikey;
  try {
    const res = await fetch(`${API_BASE}/v3/factory/releases/${encodeURIComponent(releaseRevisionId)}/status`, {
      method: 'GET',
      headers,
    });
    const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      ok: res.ok,
      httpStatus: res.status,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
      projection: projectFactoryPacketStatus(raw),
    };
  } catch (error) {
    return { ok: false, httpStatus: 0, error: error instanceof Error ? error.message : 'Network error' };
  }
}
