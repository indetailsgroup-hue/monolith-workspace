// src/core/manufacturing/export/pinnedKeys.config.ts
/**
 * Pinned Keys Configuration.
 *
 * Central configuration for allowed signing keys.
 * In production, this should be loaded from secure storage.
 *
 * IMPORTANT: This file contains PUBLIC keys only.
 * Private keys are NEVER stored in the frontend.
 *
 * v0.10.8.5 - Cross-Language Signing
 */

import { PinnedKeySetV1, PinnedKey, createEmptyKeySet } from "./sigVerify";

// =============================================================================
// DEFAULT KEY SETS
// =============================================================================

/**
 * Development key set.
 *
 * Contains development/testing keys only.
 * NOT for production use.
 */
export const DEVELOPMENT_KEY_SET: PinnedKeySetV1 = {
  version: "1.0",
  allowed: [
    // Add development keys here
    // Example:
    // {
    //   publicKeyId: "dev-key-001",
    //   scheme: "ED25519",
    //   spkiPem: `-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----`,
    //   note: "Development signing key",
    //   createdAt: "2025-01-01T00:00:00Z",
    // },
  ],
  note: "Development key set - NOT FOR PRODUCTION",
  updatedAt: new Date().toISOString(),
};

/**
 * Production key set.
 *
 * Contains production signing keys.
 * Should be loaded from secure configuration.
 */
export const PRODUCTION_KEY_SET: PinnedKeySetV1 = {
  version: "1.0",
  allowed: [
    // Production keys should be loaded from environment/config
  ],
  note: "Production key set",
  updatedAt: new Date().toISOString(),
};

// =============================================================================
// KEY SET LOADING
// =============================================================================

/**
 * Key set source type.
 */
export type KeySetSource = "EMBEDDED" | "FETCH" | "ENV";

/**
 * Key set loader options.
 */
export interface KeySetLoaderOptions {
  /** Source type */
  source: KeySetSource;

  /** URL for FETCH source */
  url?: string;

  /** Environment variable name for ENV source */
  envVar?: string;

  /** Fallback key set */
  fallback?: PinnedKeySetV1;
}

/**
 * Load key set from source.
 *
 * @param options Loader options
 * @returns Pinned key set
 */
export async function loadKeySet(
  options: KeySetLoaderOptions
): Promise<PinnedKeySetV1> {
  switch (options.source) {
    case "EMBEDDED":
      return options.fallback ?? createEmptyKeySet();

    case "FETCH":
      if (!options.url) {
        throw new Error("URL required for FETCH source");
      }
      return fetchKeySet(options.url);

    case "ENV":
      return loadKeySetFromEnv(options.envVar);

    default:
      return options.fallback ?? createEmptyKeySet();
  }
}

/**
 * Fetch key set from URL.
 *
 * @param url URL to fetch from
 * @returns Pinned key set
 */
async function fetchKeySet(url: string): Promise<PinnedKeySetV1> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch key set: ${response.status}`);
  }

  const data = await response.json();

  // Validate version
  if (data.version !== "1.0") {
    throw new Error(`Unsupported key set version: ${data.version}`);
  }

  return data as PinnedKeySetV1;
}

/**
 * Load key set from environment variable.
 *
 * @param envVar Environment variable name
 * @returns Pinned key set
 */
function loadKeySetFromEnv(envVar?: string): PinnedKeySetV1 {
  const varName = envVar ?? "MONOLITH_PINNED_KEYS";

  // Check if we're in a Node.js environment
  if (typeof process !== "undefined" && process.env) {
    const value = process.env[varName];
    if (value) {
      return JSON.parse(value) as PinnedKeySetV1;
    }
  }

  // Browser environment - check for global
  if (typeof window !== "undefined") {
    const windowWithConfig = window as unknown as {
      __MONOLITH_PINNED_KEYS__?: PinnedKeySetV1;
    };
    if (windowWithConfig.__MONOLITH_PINNED_KEYS__) {
      return windowWithConfig.__MONOLITH_PINNED_KEYS__;
    }
  }

  throw new Error(`Key set not found in environment: ${varName}`);
}

// =============================================================================
// RUNTIME KEY SET MANAGEMENT
// =============================================================================

/**
 * Current active key set.
 */
let activeKeySet: PinnedKeySetV1 | null = null;

/**
 * Get active key set.
 *
 * Returns currently active key set or throws if not initialized.
 */
export function getActiveKeySet(): PinnedKeySetV1 {
  if (!activeKeySet) {
    throw new Error("Key set not initialized. Call initializeKeySet() first.");
  }
  return activeKeySet;
}

/**
 * Check if key set is initialized.
 */
export function isKeySetInitialized(): boolean {
  return activeKeySet !== null;
}

/**
 * Initialize key set.
 *
 * @param keySet Key set to activate
 */
export function initializeKeySet(keySet: PinnedKeySetV1): void {
  activeKeySet = keySet;
}

/**
 * Clear active key set.
 */
export function clearKeySet(): void {
  activeKeySet = null;
}

// =============================================================================
// CONFIGURATION HELPERS
// =============================================================================

/**
 * Runtime environment.
 */
export type RuntimeEnv = "DEVELOPMENT" | "STAGING" | "PRODUCTION";

/**
 * Get runtime environment.
 */
export function getRuntimeEnv(): RuntimeEnv {
  // Check for explicit env variable
  if (typeof process !== "undefined" && process.env?.MONOLITH_ENV) {
    return process.env.MONOLITH_ENV as RuntimeEnv;
  }

  // Check for Node.js NODE_ENV
  if (typeof process !== "undefined" && process.env?.NODE_ENV) {
    if (process.env.NODE_ENV === "production") {
      return "PRODUCTION";
    }
    return "DEVELOPMENT";
  }

  // Browser - check for production build
  if (typeof window !== "undefined") {
    const windowWithConfig = window as unknown as {
      __MONOLITH_ENV__?: RuntimeEnv;
    };
    if (windowWithConfig.__MONOLITH_ENV__) {
      return windowWithConfig.__MONOLITH_ENV__;
    }
  }

  return "DEVELOPMENT";
}

/**
 * Get key set for current environment.
 */
export function getKeySetForEnv(): PinnedKeySetV1 {
  const env = getRuntimeEnv();

  switch (env) {
    case "PRODUCTION":
      return PRODUCTION_KEY_SET;

    case "STAGING":
      // Staging uses production keys but may have additional test keys
      return PRODUCTION_KEY_SET;

    case "DEVELOPMENT":
    default:
      return DEVELOPMENT_KEY_SET;
  }
}

/**
 * Auto-initialize key set for current environment.
 *
 * Call this at application startup.
 */
export function autoInitializeKeySet(): void {
  if (!isKeySetInitialized()) {
    initializeKeySet(getKeySetForEnv());
  }
}

// =============================================================================
// KEY SET EXPORT FOR FACTORY
// =============================================================================

/**
 * Export key set to JSON for factory distribution.
 *
 * This creates a pinned key file that can be distributed
 * to factory PCs for offline verification.
 */
export function exportKeySetForFactory(
  keySet: PinnedKeySetV1,
  options?: {
    includeExpired?: boolean;
    note?: string;
  }
): string {
  const filtered = options?.includeExpired
    ? keySet
    : {
        ...keySet,
        allowed: keySet.allowed.filter((k) => {
          if (!k.expiresAt) return true;
          return new Date(k.expiresAt) > new Date();
        }),
      };

  const exportSet: PinnedKeySetV1 = {
    ...filtered,
    note: options?.note ?? `Factory export - ${new Date().toISOString()}`,
    updatedAt: new Date().toISOString(),
  };

  return JSON.stringify(exportSet, null, 2);
}

/**
 * Create factory key file content.
 *
 * Standardized format for production.pubkeys.v1.json.
 */
export function createFactoryKeyFile(
  keys: PinnedKey[],
  note?: string
): PinnedKeySetV1 {
  return {
    version: "1.0",
    allowed: keys,
    note: note ?? `MONOLITH Production Keys - ${new Date().toISOString()}`,
    updatedAt: new Date().toISOString(),
  };
}

// =============================================================================
// SIGNER API INTEGRATION
// =============================================================================

/**
 * Fetch pinned key from signer service.
 *
 * @param signerUrl Base URL of signer service
 * @param options Fetch options
 * @returns PinnedKey entry from signer
 */
export async function fetchPinnedKeyFromSigner(
  signerUrl: string,
  options?: {
    note?: string;
  }
): Promise<PinnedKey> {
  const url = new URL("/v1/pubkey/pinned", signerUrl);
  if (options?.note) {
    url.searchParams.set("note", options.note);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch pinned key: ${response.status}`);
  }

  const data = await response.json();

  // Map response to PinnedKey (remove fingerprint field if present)
  return {
    publicKeyId: data.publicKeyId,
    scheme: data.scheme,
    spkiPem: data.spkiPem,
    note: data.note,
    createdAt: data.createdAt,
  };
}

/**
 * Initialize key set from signer service.
 *
 * Fetches the public key from the signer and initializes the active key set.
 *
 * @param signerUrl Base URL of signer service
 */
export async function initializeKeySetFromSigner(signerUrl: string): Promise<void> {
  const pinnedKey = await fetchPinnedKeyFromSigner(signerUrl);

  const keySet: PinnedKeySetV1 = {
    version: "1.0",
    allowed: [pinnedKey],
    note: `Loaded from signer at ${signerUrl}`,
    updatedAt: new Date().toISOString(),
  };

  initializeKeySet(keySet);
}

/**
 * Load key set from public/keys/production.pubkeys.v1.json.
 *
 * For use in production builds where keys are bundled.
 */
export async function loadKeySetFromPublicPath(
  basePath: string = "/keys/production.pubkeys.v1.json"
): Promise<PinnedKeySetV1> {
  const response = await fetch(basePath);

  if (!response.ok) {
    throw new Error(`Failed to load key set: ${response.status}`);
  }

  const data = await response.json();

  if (data.version !== "1.0") {
    throw new Error(`Unsupported key set version: ${data.version}`);
  }

  return data as PinnedKeySetV1;
}

/**
 * Initialize key set from bundled public path.
 *
 * @param basePath Path to key set JSON (default: /keys/production.pubkeys.v1.json)
 */
export async function initializeKeySetFromPublicPath(
  basePath?: string
): Promise<void> {
  const keySet = await loadKeySetFromPublicPath(basePath);
  initializeKeySet(keySet);
}
