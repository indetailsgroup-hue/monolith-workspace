/**
 * Key Import/Export Utilities
 *
 * Parse and validate exported public key JSON for multi-machine key sharing.
 *
 * Scope Enforcement (v0.5):
 * - scope is REQUIRED for all exported keys
 * - FACTORY-scoped keys MUST include scopeId (factoryId)
 * - Factory devices only accept keys bound to their factoryId
 */

import type { KeyScope } from './types';

/**
 * Exported public key JSON format
 *
 * This is the portable format for sharing public keys between machines.
 * Note: scope is required for scope enforcement.
 */
export type ExportedPublicKeyJson = {
  format: 'raw';
  alg: 'ed25519';
  keyId: string;
  publicKeyBase64: string;
  createdAtIso?: string;
  /** Scope is required for scope enforcement */
  scope: KeyScope;
  /** Required for FACTORY scope (factoryId binding) */
  scopeId?: string;
  label?: string;
};

/**
 * Parse and validate exported public key JSON
 *
 * @param text - JSON string to parse
 * @returns Validated exported key object
 * @throws Error if JSON is invalid or missing required fields
 */
export function parseExportedPublicKeyJson(text: string): ExportedPublicKeyJson {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let obj: any;

  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON format.');
  }

  // Validate required fields
  if (obj?.format !== 'raw') {
    throw new Error('Invalid format. Expected "raw".');
  }

  if (obj?.alg !== 'ed25519') {
    throw new Error('Invalid algorithm. Expected "ed25519".');
  }

  if (typeof obj.keyId !== 'string' || obj.keyId.length < 16) {
    throw new Error('Invalid keyId. Must be at least 16 characters.');
  }

  if (typeof obj.publicKeyBase64 !== 'string' || obj.publicKeyBase64.length < 20) {
    throw new Error('Invalid publicKeyBase64. Must be at least 20 characters.');
  }

  // Validate required scope (v0.5: scope is now required)
  if (!['ORG', 'FACTORY', 'PROJECT'].includes(obj.scope)) {
    throw new Error('Invalid or missing scope. Must be ORG, FACTORY, or PROJECT.');
  }

  // FACTORY scope requires scopeId (factoryId binding)
  if (obj.scope === 'FACTORY') {
    if (typeof obj.scopeId !== 'string' || obj.scopeId.length === 0) {
      throw new Error('FACTORY-scoped keys must include scopeId (factoryId).');
    }
  }

  return obj as ExportedPublicKeyJson;
}

/**
 * Create exported public key JSON
 *
 * @param input - Key data to export (scope is required)
 * @returns JSON string
 * @throws Error if FACTORY scope without scopeId
 */
export function createExportedPublicKeyJson(input: {
  keyId: string;
  publicKeyBase64: string;
  createdAtIso?: string;
  scope: KeyScope;
  scopeId?: string;
  label?: string;
}): string {
  // Validate FACTORY scope requires scopeId
  if (input.scope === 'FACTORY' && !input.scopeId) {
    throw new Error('FACTORY-scoped keys must include scopeId (factoryId).');
  }

  const bundle: ExportedPublicKeyJson = {
    format: 'raw',
    alg: 'ed25519',
    keyId: input.keyId,
    publicKeyBase64: input.publicKeyBase64,
    createdAtIso: input.createdAtIso,
    scope: input.scope,
    scopeId: input.scopeId,
    label: input.label,
  };

  return JSON.stringify(bundle, null, 2) + '\n';
}

/**
 * Get short fingerprint for visual verification
 *
 * @param keyId - Full keyId (SHA-256 hash)
 * @returns Short fingerprint (first 12 chars with separator)
 */
export function getKeyFingerprint(keyId: string): string {
  if (keyId.length < 12) return keyId;
  // Format: XXXX-XXXX-XXXX
  return `${keyId.slice(0, 4)}-${keyId.slice(4, 8)}-${keyId.slice(8, 12)}`;
}

/**
 * Validate Base64-encoded public key
 *
 * Ed25519 public keys are 32 bytes = 44 Base64 characters (with padding)
 *
 * @param base64 - Base64 string to validate
 * @returns True if valid Ed25519 public key length
 */
export function isValidEd25519PublicKeyBase64(base64: string): boolean {
  try {
    // Decode and check length (32 bytes for Ed25519)
    const decoded = atob(base64);
    return decoded.length === 32;
  } catch {
    return false;
  }
}
