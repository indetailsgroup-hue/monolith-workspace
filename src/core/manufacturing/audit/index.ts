// src/core/manufacturing/audit/index.ts
/**
 * Audit Module.
 *
 * Deterministic hashing and audit trail utilities.
 *
 * v0.10.8.5 - Cross-Language Signing
 */

export {
  // Stable stringify
  stableStringify,

  // SHA-256
  sha256,
  sha256Object,

  // Fingerprinting
  fingerprint,
  fingerprintObject,

  // Simple hash (sync)
  simpleHash,
  simpleHashObject,

  // Audit records
  createAuditRecord,
  createObjectAuditRecord,

  // Verification
  verifyHash,
  verifyObjectHash,

  // Types
  type AuditRecord,
} from "./hashing";

// Cross-language hashing (for signing service)
export {
  // Stable stringify (cross-language)
  stableStringifyCrossLang,

  // SHA-256 (cross-language)
  sha256CrossLang,
  sha256ObjectCrossLang,

  // Simple hash (cross-language)
  simpleHashCrossLang,

  // Manifest hashing
  extractUnsignedContent,
  computeManifestHashForSigning,

  // Test vector verification
  verifyTestVector,
  verifyAllTestVectors,
  generateGoldenHashes,

  // Types
  type ManifestUnsignedContent,
  type HashTestVector,
} from "./crossLangHash";
