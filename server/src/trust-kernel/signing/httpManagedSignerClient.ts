/**
 * httpManagedSignerClient.ts - HTTP managed-signer client (design §8, §11.2)
 *
 * A `ManagedSignerPort` backed by a remote managed signer over HTTP. It sends
 * ONLY `{ keyId, purpose, digestSha256 }` plus a short-lived workload-identity
 * bearer token from an injected credential provider; it never sends, receives, or
 * stores a private key. `fetch` is injected so the client is deterministically
 * testable and carries no ambient network dependency.
 *
 * Denial order and stable reason codes (design §13):
 *   - private key material on the input, or a non-digest request  -> CRYPTO_ALGORITHM_DENIED
 *   - wrong pinned key id                                         -> CRYPTO_ALGORITHM_DENIED
 *   - purpose not bound to this key (Task 3 requireKeyPurpose)    -> CRYPTO_ALGORITHM_DENIED
 *   - timeout / abort / network error / non-2xx response          -> CRYPTO_SIGNER_UNAVAILABLE
 *   - response algorithm not Ed25519, or key id mismatch          -> CRYPTO_ALGORITHM_DENIED
 *   - missing / malformed signature bytes                         -> CRYPTO_SIGNATURE_INVALID
 *
 * Phase: NOT_FOR_PRODUCTION.
 *
 * @version 0.13.2
 */

import { ok, err, type TrustResult } from '../result.js';
import type { KeyPurpose, TrustedKeyV1 } from '../contracts/protocolV3.js';
import { requireKeyPurpose } from '../governance/verifyGovernanceSignature.js';
import {
  guardDigestOnlyInput,
  propagateFailure,
  MANAGED_SIGNER_ALGORITHM,
  type ManagedSignerPort,
  type ManagedSignerSignInput,
  type ManagedSignature,
} from './managedSignerPort.js';

/** A short-lived workload-identity bearer token (never a private key). */
export type WorkloadCredentialProvider = () => Promise<string>;

/** The minimal fetch surface the client depends on; injected for testability. */
export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export interface FetchLikeInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}
export type FetchLike = (url: string, init?: FetchLikeInit) => Promise<FetchLikeResponse>;

export interface HttpManagedSignerConfig {
  /** The managed-signer signing endpoint. */
  endpoint: string;
  /** The pinned public key ID this client is authorized to request. */
  keyId: string;
  /** The purpose this key is minted for (design §11.3). */
  keyPurpose: KeyPurpose;
  /** Supplies the isolated workload-identity bearer token per request. */
  credentialProvider: WorkloadCredentialProvider;
  /** Hard timeout in milliseconds; an exceeded deadline is CRYPTO_SIGNER_UNAVAILABLE. */
  timeoutMs: number;
  /** Injected fetch implementation. */
  fetch: FetchLike;
}

export class HttpManagedSignerClient implements ManagedSignerPort {
  private readonly config: HttpManagedSignerConfig;

  constructor(config: HttpManagedSignerConfig) {
    this.config = config;
  }

  async sign(
    input: Readonly<ManagedSignerSignInput>,
  ): Promise<TrustResult<Readonly<ManagedSignature>>> {
    // 1. Fail-closed on private key material or a non-digest request.
    const guarded = guardDigestOnlyInput(input);
    if (!guarded.ok) return propagateFailure(guarded);
    const { keyId, purpose, digestSha256 } = guarded.value;

    // 2. The client is pinned to exactly one key id.
    if (keyId !== this.config.keyId) {
      return err('CRYPTO_ALGORITHM_DENIED', {
        reason: 'requested key id is not the pinned signer key',
        expected: this.config.keyId,
        actual: keyId,
      });
    }

    // 3. Bind the requested purpose to the key's declared purpose (Task 3).
    const keyDescriptor: TrustedKeyV1 = {
      keyId: this.config.keyId,
      purpose: this.config.keyPurpose,
      algorithm: 'ed25519',
      validFrom: '1970-01-01T00:00:00.000Z',
      validUntil: '9999-12-31T23:59:59.999Z',
    };
    const purposeResult = requireKeyPurpose(keyDescriptor, purpose);
    if (!purposeResult.ok) return propagateFailure(purposeResult);

    // 4. Acquire the workload-identity token (never a key).
    let token: string;
    try {
      token = await this.config.credentialProvider();
    } catch (cause) {
      return err('CRYPTO_SIGNER_UNAVAILABLE', {
        reason: 'workload credential provider failed',
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }

    // 5. Call the remote signer with a hard deadline. Body carries ONLY the digest.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response: FetchLikeResponse;
    try {
      response = await this.config.fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ keyId, purpose, digestSha256 }),
        signal: controller.signal,
      });
    } catch (cause) {
      return err('CRYPTO_SIGNER_UNAVAILABLE', {
        reason: 'signer unreachable or timed out',
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      return err('CRYPTO_SIGNER_UNAVAILABLE', {
        reason: 'signer returned a non-2xx status',
        status: String(response.status),
      });
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (cause) {
      return err('CRYPTO_SIGNER_UNAVAILABLE', {
        reason: 'signer response was not valid JSON',
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }

    // 6. Validate the response is a pinned Ed25519 signature for the pinned key.
    const body = (payload ?? {}) as Record<string, unknown>;
    if (body.algorithm !== MANAGED_SIGNER_ALGORITHM) {
      return err('CRYPTO_ALGORITHM_DENIED', {
        reason: 'signer returned a non-Ed25519 algorithm',
        actual: String(body.algorithm),
      });
    }
    if (body.keyId !== keyId) {
      return err('CRYPTO_ALGORITHM_DENIED', {
        reason: 'signer signed with a different key id',
        expected: keyId,
        actual: String(body.keyId),
      });
    }
    if (typeof body.signatureBase64 !== 'string' || body.signatureBase64.length === 0) {
      return err('CRYPTO_SIGNATURE_INVALID', { reason: 'signer returned no signature bytes' });
    }

    return ok({
      algorithm: MANAGED_SIGNER_ALGORITHM,
      keyId,
      signatureBase64: body.signatureBase64,
    });
  }
}
