/**
 * stateApi.ts - P11 Server State API Client
 *
 * Client for P10 Server State Transition endpoints:
 * - GET  /api/factory/jobs/:jobId/state
 * - POST /api/factory/jobs/:jobId/freeze
 * - POST /api/factory/jobs/:jobId/release
 * - POST /api/factory/jobs/:jobId/revoke
 * - GET  /api/factory/jobs/:jobId/can-export
 * - GET  /api/factory/jobs/:jobId/proof (P12)
 *
 * @version 1.1.0
 */

// ============================================
// TYPES
// ============================================

export type ServerSpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

export interface StateResponse {
  ok: boolean;
  jobId?: string;
  specState?: ServerSpecState;
  revisionId?: string;
  packetSha256?: string;
  manifestSha256?: string;
  updatedAt?: string;
  frozenAt?: string;
  releasedAt?: string;
  revokedAt?: string;
  at?: string;
  error?: string;
}

export interface CanExportResponse {
  ok: boolean;
  canExport?: boolean;
  specState?: string;
  revisionId?: string;
  reason?: string;
  error?: string;
}

export interface TransitionRequest {
  note?: string;
  changeClass?: 'GEOMETRY' | 'MATERIAL' | 'HARDWARE' | 'TOOLPATHS' | 'NESTING' | 'METADATA';
}

export type Actor = {
  role: string;
  name: string;
};

// ============================================
// CONFIGURATION
// ============================================

// ADR-060: ชี้ factory-api (Supabase Edge Function) — ตั้งผ่าน env; ว่าง = vite proxy เดิม
const API_BASE = (import.meta.env?.VITE_FACTORY_API_BASE as string | undefined) ?? '';
const ANON_KEY = (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

/** auth headers: session จาก Field App (ADR-058) + anon key — จำเป็นเมื่อยิงตรง edge function */
function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (!ANON_KEY) return h;
  h['apikey'] = ANON_KEY;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !/^sb-.+-auth-token$/.test(key)) continue;
      const s = JSON.parse(localStorage.getItem(key) ?? '');
      if (s?.access_token && (!s.expires_at || s.expires_at * 1000 > Date.now())) {
        h['Authorization'] = 'Bearer ' + s.access_token;
        break;
      }
    }
  } catch { /* no session */ }
  if (!h['Authorization']) h['Authorization'] = 'Bearer ' + ANON_KEY;
  return h;
}

// Default actor for state transitions
function getDefaultActor(): Actor {
  return {
    role: 'DESIGNER',
    name: 'Designer',
  };
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Get current job state from server.
 * Returns server-authoritative state.
 */
export async function getJobState(jobId: string): Promise<StateResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/state`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[StateAPI] getJobState failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Freeze a job (DRAFT -> FROZEN).
 * Server will compute revision anchors.
 */
export async function freezeJob(
  jobId: string,
  options?: TransitionRequest
): Promise<StateResponse> {
  const actor = getDefaultActor();

  try {
    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/freeze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        'X-Actor-Role': actor.role,
        'X-Actor-Name': actor.name,
      },
      body: JSON.stringify(options || {}),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[StateAPI] freezeJob failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Release a job (FROZEN -> RELEASED).
 * Server will compute revision anchors.
 */
export async function releaseJob(
  jobId: string,
  options?: TransitionRequest
): Promise<StateResponse> {
  const actor = getDefaultActor();

  try {
    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/release`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        'X-Actor-Role': actor.role,
        'X-Actor-Name': actor.name,
      },
      body: JSON.stringify(options || {}),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[StateAPI] releaseJob failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Unfreeze a job (FROZEN -> DRAFT).
 * S15-3: เดิม client เปลี่ยน local อย่างเดียว ทำให้ drift กับ server
 */
export async function unfreezeJob(
  jobId: string,
  options?: TransitionRequest
): Promise<StateResponse> {
  const actor = getDefaultActor();

  try {
    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/unfreeze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        'X-Actor-Role': actor.role,
        'X-Actor-Name': actor.name,
      },
      body: JSON.stringify(options || {}),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[StateAPI] unfreezeJob failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Revoke a job (RELEASED -> FROZEN).
 * Invalidates the release for export gate.
 */
export async function revokeJob(
  jobId: string,
  options?: TransitionRequest
): Promise<StateResponse> {
  const actor = getDefaultActor();

  try {
    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/revoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
        'X-Actor-Role': actor.role,
        'X-Actor-Name': actor.name,
      },
      body: JSON.stringify(options || {}),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[StateAPI] revokeJob failed:', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Check if a job can be exported.
 * Server-authoritative export gate check.
 */
export async function checkCanExport(jobId: string): Promise<CanExportResponse> {
  try {
    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/can-export`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[StateAPI] checkCanExport failed:', error);
    return {
      ok: false,
      canExport: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * ADR-061 packet store: อัปโหลด packet ZIP ขึ้น server (โรงงานดึงผ่าน /export)
 * server (edge) คำนวณ sha256 เอง — client ไม่ต้องแนบ hash
 */
export async function uploadPacket(
  jobId: string,
  zipBlob: Blob,
): Promise<{ ok: boolean; packetSha256?: string; storagePath?: string; error?: string }> {
  try {
    const buf = new Uint8Array(await zipBlob.arrayBuffer());
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
    }
    const zipBase64 = btoa(bin);

    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/packet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ zipBase64 }),
    });
    return await response.json();
  } catch (error) {
    console.error('[StateAPI] uploadPacket failed:', error);
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

// ============================================
// SYNC UTILITIES
// ============================================

export type SyncStatus = 'synced' | 'pending' | 'error' | 'offline';

/**
 * Determine sync status based on server response.
 */
export function getSyncStatus(response: StateResponse): SyncStatus {
  if (!response.ok) {
    if (response.error?.includes('Network') || response.error?.includes('fetch')) {
      return 'offline';
    }
    return 'error';
  }
  return 'synced';
}

/**
 * Check if server is reachable.
 */
export async function isServerReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/api/health`, {
      method: 'GET',
      headers: authHeaders(),
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================
// P12: PROOF BUNDLE
// ============================================

export const PROOF_VERSION = 'MONOLITH_PROOF_V1' as const;

export interface ProofState {
  specState: ServerSpecState;
  revisionId?: string;
  manifestSha256?: string;
  packetSha256?: string;
  frozenAt?: string;
  releasedAt?: string;
  revokedAt?: string;
  updatedAt: string;
}

export interface ProofVerify {
  at: string;
  verdict: 'PASS' | 'PASS_WITH_WARN' | 'FAIL' | 'UNKNOWN';
  code?: string;
  summary?: string;
}

export interface ProofExport {
  at: string;
  exportId?: string;
  artifactSha256?: string;
  artifactName?: string;
  sizeBytes?: number;
  dialect?: string;
  profileId?: string;
  mode?: string;
  target?: string;
}

export interface ProofLineageHead {
  revisionId?: string;
  at?: string;
}

export type ProofWarningCode =
  | 'W_RELEASED_NO_REVISION'
  | 'W_INVALID_ARTIFACT_HASH'
  | 'W_PASS_WITH_WARN_EXPORTED'
  | 'W_MISSING_MANIFEST_HASH'
  | 'W_LINEAGE_MISMATCH';

export interface ProofWarning {
  code: ProofWarningCode;
  message: string;
}

export interface ProofBundle {
  ok: boolean;
  version?: typeof PROOF_VERSION;
  jobId: string;
  fetchedAt: string;
  state: ProofState;
  latestVerify?: ProofVerify;
  latestExport?: ProofExport;
  lineageHead?: ProofLineageHead;
  canExport: boolean;
  canExportReason?: string;
  warnings?: ProofWarning[];
  error?: string;
}

/**
 * P12: Get proof bundle for a job.
 * Returns consolidated authority proof for dispute resolution.
 */
export async function getProofBundle(jobId: string): Promise<ProofBundle> {
  try {
    const response = await fetch(`${API_BASE}/api/factory/jobs/${encodeURIComponent(jobId)}/proof`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[StateAPI] getProofBundle failed:', error);
    return {
      ok: false,
      jobId,
      fetchedAt: new Date().toISOString(),
      state: {
        specState: 'DRAFT',
        updatedAt: new Date().toISOString(),
      },
      canExport: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}
