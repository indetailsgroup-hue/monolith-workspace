/**
 * supabaseReleaseAuthority.ts - Postgres release-authority adapter (design §5.1, §8)
 *
 * The real `ReleaseAuthorityPort` implementation: a thin client over the migration
 * 0182 release RPCs (`rpc_trust_freeze`, `rpc_trust_begin_release`,
 * `rpc_trust_commit_release`, `rpc_trust_mark_artifact_available`,
 * `rpc_trust_void_artifact`, `rpc_trust_revoke`) plus the allocation/status reads
 * the worker needs. Postgres is the SOLE release authority (design §5.1); this
 * adapter only forwards authorized calls and maps their errors to stable reason
 * codes. It holds SIGNER KEY IDs only - never a private key.
 *
 * This adapter is exercised structurally here; its live behaviour (real RPC round
 * trips, PostgREST error contracts) is Phase-C integration. Two allocation/status
 * reads (`rpc_trust_read_allocation`, `rpc_trust_artifact_status`) do not yet exist
 * in migrations 0180-0182 and are called speculatively - recorded as a spec delta.
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import { TRUST_REASON_CODES, type TrustReasonCode } from '../reasonCodes.js';
import type {
  ArtifactStatus,
} from '../contracts/protocolV3.js';
import type {
  ReleaseAuthorityPort,
  FreezeRequest,
  FreezeResult,
  BeginReleaseRequest,
  BeginReleaseResult,
  CommitReleaseRequest,
  CommitReleaseResult,
  MarkArtifactAvailableRequest,
  MarkArtifactAvailableResult,
  VoidArtifactRequest,
  VoidArtifactResult,
  RevokeReleaseRequest,
  RevokeReleaseResult,
} from '../contracts/releasePorts.js';
import type { AllocationReaderPort, ReleaseAllocationV1 } from '../worker/releaseWorker.js';

/** A PostgREST-style RPC error. */
export interface SupabaseRpcError {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

/** A PostgREST-style RPC result envelope. */
export interface SupabaseRpcResult<T = unknown> {
  data: T | null;
  error: SupabaseRpcError | null;
}

/** The minimal Supabase RPC surface this adapter depends on (injected). */
export interface SupabaseRpcClient {
  rpc<T = unknown>(fn: string, params?: Record<string, unknown>): Promise<SupabaseRpcResult<T>>;
}

/**
 * Map a PostgREST error to a stable reason code. A deterministic authority raises
 * a reason code in the error `code` or embeds it in the message; anything else is
 * treated as a conflict rather than leaked verbatim. (The Task 5 delta already
 * flags substring matching as brittle - a structured errcode contract is a
 * Phase-C hardening item.)
 */
export function mapPostgrestErrorToReasonCode(error: SupabaseRpcError | null): TrustReasonCode {
  if (error === null) return 'STATE_CONFLICT';
  const codeField = typeof error.code === 'string' ? error.code : '';
  if ((TRUST_REASON_CODES as readonly string[]).includes(codeField)) {
    return codeField as TrustReasonCode;
  }
  const haystack = `${error.code ?? ''} ${error.message ?? ''} ${error.details ?? ''}`;
  for (const candidate of TRUST_REASON_CODES) {
    if (haystack.includes(candidate)) return candidate;
  }
  return 'STATE_CONFLICT';
}

export class SupabaseReleaseAuthority implements ReleaseAuthorityPort, AllocationReaderPort {
  private readonly client: SupabaseRpcClient;

  constructor(client: SupabaseRpcClient) {
    this.client = client;
  }

  private async call<T>(fn: string, params: Record<string, unknown>): Promise<TrustResult<T>> {
    let result: SupabaseRpcResult<T>;
    try {
      result = await this.client.rpc<T>(fn, params);
    } catch (cause) {
      return err('STATE_CONFLICT', {
        rpc: fn,
        reason: cause instanceof Error ? cause.message : 'rpc transport failure',
      });
    }
    if (result.error !== null || result.data === null) {
      return err(mapPostgrestErrorToReasonCode(result.error), { rpc: fn });
    }
    return ok(result.data);
  }

  freeze(request: FreezeRequest): Promise<TrustResult<FreezeResult>> {
    return this.call<FreezeResult>('rpc_trust_freeze', { p_request: request });
  }

  beginRelease(request: BeginReleaseRequest): Promise<TrustResult<BeginReleaseResult>> {
    return this.call<BeginReleaseResult>('rpc_trust_begin_release', { p_request: request });
  }

  commitRelease(request: CommitReleaseRequest): Promise<TrustResult<CommitReleaseResult>> {
    // Only key IDs and hashes cross this boundary - never a private key.
    return this.call<CommitReleaseResult>('rpc_trust_commit_release', {
      p_attempt_id: request.attemptId,
      p_content_hash: request.contentHash,
      p_expected_packet_hash: request.expectedPacketHash,
      p_certificate: request.certificate,
      p_signer_key_id: request.signerKeyId,
    });
  }

  markArtifactAvailable(
    request: MarkArtifactAvailableRequest,
  ): Promise<TrustResult<MarkArtifactAvailableResult>> {
    return this.call<MarkArtifactAvailableResult>('rpc_trust_mark_artifact_available', {
      p_artifact_id: request.artifactId,
      p_content_hash: request.contentHash,
    });
  }

  voidArtifact(request: VoidArtifactRequest): Promise<TrustResult<VoidArtifactResult>> {
    return this.call<VoidArtifactResult>('rpc_trust_void_artifact', {
      p_attempt_id: request.attemptId,
      p_reason: request.reason,
    });
  }

  revoke(request: RevokeReleaseRequest): Promise<TrustResult<RevokeReleaseResult>> {
    return this.call<RevokeReleaseResult>('rpc_trust_revoke', { p_request: request });
  }

  // Speculative reads (no RPC in 0180-0182 yet; Task 9 / a new migration must supply).
  readAllocation(attemptId: string): Promise<TrustResult<ReleaseAllocationV1>> {
    return this.call<ReleaseAllocationV1>('rpc_trust_read_allocation', { p_attempt_id: attemptId });
  }

  getArtifactStatus(artifactId: string): Promise<TrustResult<ArtifactStatus>> {
    return this.call<ArtifactStatus>('rpc_trust_artifact_status', { p_artifact_id: artifactId });
  }
}
