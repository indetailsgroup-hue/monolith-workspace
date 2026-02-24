// src/core/manufacturing/export/signerClient.ts
/**
 * Signer Service Client.
 *
 * Client for calling the MONOLITH signing service.
 * Handles manifest signing requests via HTTP.
 *
 * Service endpoint: /v1/sign
 * Protocol: Ed25519 signature over manifestHash
 *
 * v0.10.8.5 - Cross-Language Signing
 */

// =============================================================================
// SIGNER REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Sign manifest request.
 *
 * Sent to signing service.
 */
export interface SignManifestRequest {
  /** Request version */
  version: "1.0";

  /** Manifest hash (SHA-256 hex, 64 chars) */
  manifestHashHex: string;

  /** Key ID to use for signing (optional, uses default if not specified) */
  keyId?: string;

  /** Signer identity (optional audit trail) */
  signerId?: string;

  /** Request metadata */
  meta?: {
    jobId?: string;
    projectId?: string;
    requestedAt?: string;
  };
}

/**
 * Sign manifest response.
 *
 * Returned from signing service.
 */
export interface SignManifestResponse {
  /** Response version */
  version: "1.0";

  /** Status */
  status: "OK" | "ERROR";

  /** Signature (if OK) */
  signature?: {
    /** Signature scheme */
    scheme: "ED25519";

    /** Public key ID (KMS key ARN or fingerprint) */
    publicKeyId: string;

    /** Ed25519 signature (hex, 128 chars) */
    signatureHex: string;

    /** Signing timestamp (ISO 8601) */
    signedAtIso: string;

    /** Signer identity */
    signerId?: string;
  };

  /** Error details (if ERROR) */
  error?: {
    code: string;
    message: string;
    detail?: Record<string, unknown>;
  };
}

// =============================================================================
// SIGNER CLIENT
// =============================================================================

/**
 * Signer client options.
 */
export interface SignerClientOptions {
  /** Signer service base URL */
  baseUrl: string;

  /** Request timeout (ms) */
  timeoutMs?: number;

  /** API key (optional) */
  apiKey?: string;

  /** Default key ID */
  defaultKeyId?: string;
}

/**
 * Signer client error.
 */
export class SignerClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public detail?: Record<string, unknown>
  ) {
    super(message);
    this.name = "SignerClientError";
  }
}

/**
 * Signer service client.
 *
 * Calls signing service to sign manifests.
 */
export class SignerClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly apiKey?: string;
  private readonly defaultKeyId?: string;

  constructor(options: SignerClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); // Remove trailing slash
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.apiKey = options.apiKey;
    this.defaultKeyId = options.defaultKeyId;
  }

  /**
   * Sign a manifest hash.
   *
   * @param manifestHashHex SHA-256 hash of manifest (64 hex chars)
   * @param options Optional parameters
   * @returns Signature response
   * @throws SignerClientError on failure
   */
  async signManifest(
    manifestHashHex: string,
    options?: {
      keyId?: string;
      signerId?: string;
      jobId?: string;
      projectId?: string;
    }
  ): Promise<SignManifestResponse> {
    // Validate manifest hash
    if (!/^[a-f0-9]{64}$/i.test(manifestHashHex)) {
      throw new SignerClientError(
        "Invalid manifestHashHex: must be 64 hex characters",
        "INVALID_INPUT"
      );
    }

    const request: SignManifestRequest = {
      version: "1.0",
      manifestHashHex: manifestHashHex.toLowerCase(),
      keyId: options?.keyId ?? this.defaultKeyId,
      signerId: options?.signerId,
      meta: {
        jobId: options?.jobId,
        projectId: options?.projectId,
        requestedAt: new Date().toISOString(),
      },
    };

    const url = `${this.baseUrl}/v1/sign`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new SignerClientError(
          `Signer service returned ${response.status}: ${errorText}`,
          "HTTP_ERROR",
          { status: response.status, body: errorText }
        );
      }

      const result = (await response.json()) as SignManifestResponse;

      if (result.status === "ERROR") {
        throw new SignerClientError(
          result.error?.message ?? "Signing failed",
          result.error?.code ?? "SIGN_ERROR",
          result.error?.detail
        );
      }

      return result;
    } catch (error) {
      if (error instanceof SignerClientError) {
        throw error;
      }

      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new SignerClientError(
            `Signer service timeout after ${this.timeoutMs}ms`,
            "TIMEOUT"
          );
        }
        throw new SignerClientError(
          `Network error: ${error.message}`,
          "NETWORK_ERROR"
        );
      }

      throw new SignerClientError("Unknown error", "UNKNOWN");
    }
  }

  /**
   * Health check.
   *
   * @returns true if service is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.baseUrl}/health`, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      return response.ok;
    } catch {
      return false;
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Default signer service URL.
 *
 * Can be overridden via environment variable.
 */
export const DEFAULT_SIGNER_URL = "http://localhost:8080";

/**
 * Create signer client from environment.
 *
 * Uses MONOLITH_SIGNER_URL environment variable if available.
 */
export function createSignerClient(
  options?: Partial<SignerClientOptions>
): SignerClient {
  const baseUrl =
    options?.baseUrl ??
    (typeof process !== "undefined"
      ? process.env?.MONOLITH_SIGNER_URL
      : undefined) ??
    DEFAULT_SIGNER_URL;

  const apiKey =
    options?.apiKey ??
    (typeof process !== "undefined"
      ? process.env?.MONOLITH_SIGNER_API_KEY
      : undefined);

  return new SignerClient({
    baseUrl,
    apiKey,
    timeoutMs: options?.timeoutMs ?? 30000,
    defaultKeyId: options?.defaultKeyId,
  });
}

// =============================================================================
// MANIFEST SIGNING HELPER
// =============================================================================

/**
 * Sign a manifest and return updated signature block.
 *
 * @param client Signer client
 * @param manifestHashHex Manifest hash
 * @param options Additional options
 * @returns Signature block for manifest
 */
export async function signManifestAndGetBlock(
  client: SignerClient,
  manifestHashHex: string,
  options?: {
    keyId?: string;
    signerId?: string;
    jobId?: string;
  }
): Promise<{
  scheme: "ED25519";
  publicKeyId: string;
  signatureHex: string;
  signedAtIso: string;
  signerId?: string;
}> {
  const response = await client.signManifest(manifestHashHex, options);

  if (!response.signature) {
    throw new SignerClientError(
      "Signing succeeded but no signature returned",
      "NO_SIGNATURE"
    );
  }

  return {
    scheme: response.signature.scheme,
    publicKeyId: response.signature.publicKeyId,
    signatureHex: response.signature.signatureHex,
    signedAtIso: response.signature.signedAtIso,
    signerId: response.signature.signerId,
  };
}
