/**
 * exportBundleTypes.ts - Export Bundle Types for Trust Chain
 *
 * ARCHITECTURE:
 * - ExportArtifactRef: Reference to stored artifact with hash
 * - ExportBundleProof: Cryptographic proof of bundle contents
 * - ExportRecord: Complete export record stored in manifest chain
 *
 * DETERMINISM:
 * - All hashes use SHA-256 canonical JSON
 * - Bundle proof is deterministic (sorted artifacts)
 * - Full audit trail from export to factory acceptance
 */

// ============================================
// EXPORT KIND
// ============================================

/**
 * Export package type
 */
export type ExportPackageKind = 'FACTORY_PACKAGE';

// ============================================
// ARTIFACT REFERENCE
// ============================================

/**
 * Reference to a stored export artifact
 *
 * Each artifact is stored in ArtifactStore and referenced by ID.
 * The hash allows verification without re-downloading.
 */
export interface ExportArtifactRef {
  /** Storage ID (e.g., "ART_abc123") */
  artifactId: string;

  /** Logical path in bundle (e.g., "sheets/A01.dxf") */
  path: string;

  /** MIME type (e.g., "application/dxf", "text/csv") */
  mime: string;

  /** File size in bytes */
  bytes: number;

  /** SHA-256 hash of content */
  sha256Hex: string;
}

// ============================================
// BUNDLE PROOF
// ============================================

/**
 * Cryptographic proof of bundle contents
 *
 * Computed from canonical JSON of bundle core (artifacts sorted by path).
 * Anyone can verify the bundle matches this proof.
 */
export interface ExportBundleProof {
  /** SHA-256 hash of canonical bundle core */
  bundleHashHex: string;

  /** Hash algorithm */
  algorithm: 'SHA256';

  /** Timestamp when proof was created */
  createdIso: string;
}

// ============================================
// EXPORT RECORD
// ============================================

/**
 * Complete export record stored in manifest chain
 *
 * This is appended to SignedJobManifest.exports[] when
 * a factory package is generated.
 *
 * TRACEABILITY:
 * - sourceManifestHashHex links to the manifest at export time
 * - specStateAtExport records what state the spec was in
 * - All artifact hashes are recorded for verification
 */
export interface ExportRecord {
  /** Unique export ID (deterministic: EXP_{bundleHash.slice(0,16)}) */
  exportId: string;

  /** Export package type */
  kind: ExportPackageKind;

  /** Export timestamp */
  createdIso: string;

  // ---- What was exported ----
  /** References to all artifacts in the bundle */
  artifacts: ExportArtifactRef[];

  /** Cryptographic proof of bundle contents */
  proof: ExportBundleProof;

  // ---- Traceability ----
  /** Manifest HEAD hash at time of export */
  sourceManifestHashHex: string;

  /** Spec state at time of export */
  specStateAtExport: 'DRAFT' | 'FROZEN' | 'RELEASED';

  // ---- Metadata ----
  /** Optional notes */
  notes?: string;

  /** Who created this export */
  createdBy?: string;
}

// ============================================
// BUNDLE CORE (for hashing)
// ============================================

/**
 * Core bundle data for deterministic hashing
 *
 * This is what gets hashed to produce bundleHashHex.
 * Artifacts are sorted by path for determinism.
 */
export interface ExportBundleCore {
  kind: ExportPackageKind;
  jobId: string;
  sourceManifestHashHex: string;
  specStateAtExport: 'DRAFT' | 'FROZEN' | 'RELEASED';
  createdIso: string;
  artifacts: Array<{
    path: string;
    sha256Hex: string;
    bytes: number;
    mime: string;
  }>;
  notes: string;
}

// ============================================
// HELPERS
// ============================================

/**
 * Generate deterministic export ID from bundle hash
 */
export function makeExportId(bundleHashHex: string): string {
  return `EXP_${bundleHashHex.slice(0, 16)}`;
}

/**
 * Generate deterministic artifact ID from content hash
 */
export function makeArtifactId(contentHashHex: string): string {
  return `ART_${contentHashHex.slice(0, 16)}`;
}
