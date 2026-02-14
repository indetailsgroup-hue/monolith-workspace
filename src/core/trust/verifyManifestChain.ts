/**
 * verifyManifestChain.ts - Verify Signed Manifest Chain
 *
 * VERIFICATION LEVELS:
 * 1. Single manifest verification
 * 2. Full chain verification (back to genesis)
 *
 * CHECKS PER MANIFEST:
 * - SignedTrustReport signature valid
 * - Trust gate.ok is true
 * - Manifest hash matches computed
 * - Manifest signature valid
 * - prevManifestHashHex links correctly
 */

import type { SignedJobManifest, ManifestCore } from './manifestChainTypes';
import type { Keyring } from '../crypto/keyring';
import { sha256CanonicalHex } from '../crypto/sha256';
import { verifyHashHex } from '../crypto/ed25519';
import { verifySignedTrustReport } from './verifyTrustReport';
import { extractManifestCore } from './manifestChainTypes';

// ============================================
// MANIFEST STORE INTERFACE
// ============================================

/**
 * Interface for loading manifests from storage
 */
export interface ManifestStore {
  /**
   * Load manifest by its hash
   * @param hashHex - Manifest hash to look up
   * @returns Manifest or null if not found
   */
  loadByHash(hashHex: string): Promise<SignedJobManifest | null>;
}

// ============================================
// VERIFICATION RESULT
// ============================================

export interface ManifestVerificationResult {
  /** Whether verification passed */
  ok: boolean;
  /** Reason for failure (if not ok) */
  reason?: string;
  /** Manifest hash that was verified */
  manifestHashHex?: string;
  /** Trust key ID that was verified */
  trustKeyId?: string;
  /** Manifest key ID that was verified */
  manifestKeyId?: string;
}

export interface ChainVerificationResult {
  /** Whether full chain verified */
  ok: boolean;
  /** Reason for failure (if not ok) */
  reason?: string;
  /** Number of manifests verified in chain */
  chainLength: number;
  /** Hash of head manifest */
  headHashHex?: string;
  /** Hash of genesis manifest */
  genesisHashHex?: string;
}

// ============================================
// SINGLE MANIFEST VERIFICATION
// ============================================

/**
 * Verify a single signed manifest
 *
 * @param args.manifest - Manifest to verify
 * @param args.keyring - Keyring with trusted public keys
 * @returns Verification result
 */
export async function verifyManifest(args: {
  manifest: SignedJobManifest;
  keyring: Keyring;
}): Promise<ManifestVerificationResult> {
  const { manifest, keyring } = args;

  // 1. Verify signed trust report
  const trustResult = await verifySignedTrustReport({
    signed: manifest.signedTrust,
    keyring,
  });

  if (!trustResult.ok) {
    return {
      ok: false,
      reason: `Trust verification failed: ${trustResult.reason}`,
    };
  }

  // 2. Check trust gate.ok
  if (!manifest.signedTrust.trust.gate.ok) {
    return {
      ok: false,
      reason: 'Gate not OK in trust report',
    };
  }

  // 3. Recompute manifest core hash
  const core = extractManifestCore(manifest);
  const computedHashHex = await sha256CanonicalHex(core);

  if (computedHashHex !== manifest.manifestHashHex) {
    return {
      ok: false,
      reason: 'Manifest hash mismatch - content may have been modified',
    };
  }

  // 4. Verify manifest signature
  const manifestKey = keyring.getPublicKey(manifest.manifestKeyId);
  if (!manifestKey) {
    return {
      ok: false,
      reason: `Unknown manifest keyId: ${manifest.manifestKeyId}`,
    };
  }

  const signatureValid = await verifyHashHex({
    hashHex: manifest.manifestHashHex,
    signatureHex: manifest.manifestSignatureHex,
    publicKeyHex: manifestKey.publicKeyHex,
  });

  if (!signatureValid) {
    return {
      ok: false,
      reason: 'Invalid manifest signature',
    };
  }

  // All checks passed
  return {
    ok: true,
    manifestHashHex: manifest.manifestHashHex,
    trustKeyId: manifest.signedTrust.keyId,
    manifestKeyId: manifest.manifestKeyId,
  };
}

// ============================================
// CHAIN VERIFICATION
// ============================================

/**
 * Verify manifest chain from head back to genesis
 *
 * @param args.head - Head manifest to start from
 * @param args.keyring - Keyring with trusted public keys
 * @param args.store - Store to load previous manifests
 * @param args.maxDepth - Maximum chain depth to verify (default: 100)
 * @returns Chain verification result
 */
export async function verifyChain(args: {
  head: SignedJobManifest;
  keyring: Keyring;
  store: ManifestStore;
  maxDepth?: number;
}): Promise<ChainVerificationResult> {
  const { head, keyring, store, maxDepth = 100 } = args;

  let current: SignedJobManifest | null = head;
  let chainLength = 0;
  let genesisHashHex: string | undefined;

  while (current && chainLength < maxDepth) {
    // Verify current manifest
    const result = await verifyManifest({ manifest: current, keyring });

    if (!result.ok) {
      return {
        ok: false,
        reason: `Chain verification failed at depth ${chainLength}: ${result.reason}`,
        chainLength,
      };
    }

    chainLength++;

    // Check if genesis
    if (current.prevManifestHashHex === null) {
      genesisHashHex = current.manifestHashHex;
      break; // Reached genesis, chain is complete
    }

    // Load previous manifest
    const prev = await store.loadByHash(current.prevManifestHashHex);

    if (!prev) {
      return {
        ok: false,
        reason: `Missing manifest in chain: ${current.prevManifestHashHex}`,
        chainLength,
      };
    }

    // Verify linkage (prev hash matches)
    if (prev.manifestHashHex !== current.prevManifestHashHex) {
      return {
        ok: false,
        reason: 'Chain linkage broken: prevManifestHashHex mismatch',
        chainLength,
      };
    }

    current = prev;
  }

  // Check if we hit max depth without reaching genesis
  if (chainLength >= maxDepth && current?.prevManifestHashHex !== null) {
    return {
      ok: false,
      reason: `Chain too deep (exceeded ${maxDepth}) or cyclic`,
      chainLength,
    };
  }

  return {
    ok: true,
    chainLength,
    headHashHex: head.manifestHashHex,
    genesisHashHex,
  };
}

// ============================================
// EXPORT GUARD
// ============================================

/**
 * Export guard result
 */
export interface ExportGuardResult {
  /** Whether export is allowed */
  ok: boolean;
  /** Reason for blocking (if not ok) */
  reason?: string;
  /** Detailed blocking reasons */
  details?: string[];
}

/**
 * Assert export is allowed based on verified chain
 *
 * REQUIREMENTS:
 * - Manifest chain verifies back to genesis
 * - Trust gate.ok is true
 * - No collision blocked
 */
export async function assertExportAllowedWithChain(args: {
  manifest: SignedJobManifest;
  keyring: Keyring;
  store: ManifestStore;
}): Promise<ExportGuardResult> {
  const details: string[] = [];

  // 1. Verify single manifest
  const manifestResult = await verifyManifest({
    manifest: args.manifest,
    keyring: args.keyring,
  });

  if (!manifestResult.ok) {
    return {
      ok: false,
      reason: 'Manifest verification failed',
      details: [manifestResult.reason || 'Unknown error'],
    };
  }

  // 2. Check gate.ok
  if (!args.manifest.signedTrust.trust.gate.ok) {
    details.push(`Gate has ${args.manifest.signedTrust.trust.gate.errorCount} errors`);
    return {
      ok: false,
      reason: 'Gate validation failed',
      details,
    };
  }

  // 3. Check collision not blocked
  if (args.manifest.signedTrust.trust.collision.blocked) {
    details.push(`Collision blocked with ${args.manifest.signedTrust.trust.collision.pairCount} pairs`);
    return {
      ok: false,
      reason: 'Collision detection blocked',
      details,
    };
  }

  // 4. Verify chain (optional but recommended)
  const chainResult = await verifyChain({
    head: args.manifest,
    keyring: args.keyring,
    store: args.store,
  });

  if (!chainResult.ok) {
    return {
      ok: false,
      reason: 'Chain verification failed',
      details: [chainResult.reason || 'Unknown chain error'],
    };
  }

  return { ok: true };
}

/**
 * Quick export guard (single manifest only, no chain)
 */
export async function assertExportAllowed(args: {
  manifest: SignedJobManifest;
  keyring: Keyring;
}): Promise<ExportGuardResult> {
  const result = await verifyManifest(args);

  if (!result.ok) {
    return {
      ok: false,
      reason: result.reason,
    };
  }

  if (!args.manifest.signedTrust.trust.gate.ok) {
    return {
      ok: false,
      reason: 'Gate validation failed',
    };
  }

  return { ok: true };
}
