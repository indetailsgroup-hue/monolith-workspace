// src/core/manufacturing/manifest/toolpathManifest.v1.ts
/**
 * Toolpath Manifest Schema v1.
 *
 * Chain-of-custody manifest for factory export.
 * Provides tamper-evident audit trail from design to NC files.
 *
 * Key principles:
 * - Every artifact has a SHA-256 hash
 * - manifestHash covers content (excluding chain/signature)
 * - Signature slot for server-side signing (PR-10.8.3.1)
 * - toolpath.files[] contains ALL verifiable files in packet
 *
 * v0.10.8.5 - Cross-Language Signing
 */

// =============================================================================
// HASH TYPES
// =============================================================================

/**
 * Hash algorithm (only SHA-256 supported).
 */
export type HashAlgo = "SHA-256";

/**
 * Hash reference.
 */
export interface HashRef {
  /** Algorithm used */
  algo: HashAlgo;

  /** Lowercase hex hash */
  hex: string;
}

// =============================================================================
// ARTIFACT TYPES
// =============================================================================

/**
 * Artifact kind.
 */
export type ArtifactKind =
  | "SPEC_SNAPSHOT"
  | "OPGRAPH"
  | "NESTING_PLAN"
  | "TOOLCHANGE_PLAN"
  | "IR_PROGRAM"
  | "NC_FILE"
  | "DXF_FILE"
  | "SIM_REPORT"
  | "VERIFIER_REPORT"
  | "CONSISTENCY_REPORT"
  | "GATE_REPORT";

/**
 * Reference to a hashed artifact.
 */
export interface ArtifactRef {
  /** Artifact kind */
  kind: ArtifactKind;

  /** Deterministic identifier (e.g., "sheet_01.nc") */
  id: string;

  /** Hash of artifact content */
  hash: HashRef;

  /** Optional metadata */
  meta?: Record<string, unknown>;
}

// =============================================================================
// SIGNATURE TYPES
// =============================================================================

/**
 * Signature scheme.
 */
export type SignatureScheme = "ED25519" | "RSA-PSS" | "NONE";

/**
 * Signature message type.
 *
 * Describes what bytes were signed:
 * - MANIFEST_HASH_RAW32: 32 bytes of manifestHash decoded from hex
 *   (for standard Ed25519 offline verification)
 */
export type SignatureMessageType = "MANIFEST_HASH_RAW32";

/**
 * Signature block.
 *
 * Populated by server-side signing service.
 *
 * For Ed25519:
 * - message = 32 bytes of chain.manifestHash.hex decoded from hex
 * - Verification: ed25519.verify(msg_bytes, signature, public_key)
 */
export interface SignatureBlock {
  /** Signature scheme */
  scheme: SignatureScheme;

  /**
   * Message type (what was signed).
   *
   * MANIFEST_HASH_RAW32 = 32 bytes of manifestHash decoded from hex.
   * This allows standard Ed25519 verification (not Ed25519ph).
   */
  message?: SignatureMessageType;

  /** KMS key ID or public key fingerprint */
  publicKeyId?: string;

  /** Signature over manifestHash (hex) */
  signatureHex?: string;

  /** Signing timestamp (ISO 8601) */
  signedAtIso?: string;

  /** Signer identity (optional) */
  signerId?: string;
}

// =============================================================================
// SPEC STATE
// =============================================================================

/**
 * Spec state for export eligibility.
 */
export type ManifestSpecState = "DRAFT" | "FROZEN" | "RELEASED";

// =============================================================================
// MANIFEST SCHEMA
// =============================================================================

/**
 * Job information.
 */
export interface ManifestJob {
  /** Job identifier */
  jobId: string;

  /** Project identifier (optional) */
  projectId?: string;

  /** Spec state at manifest creation */
  specState: ManifestSpecState;

  /** Spec snapshot artifact */
  specSnapshot: ArtifactRef;
}

/**
 * Manufacturing truth (design intent).
 */
export interface ManifestManufacturingTruth {
  /** Operation graph artifact */
  opGraph: ArtifactRef;

  /** Nesting plan artifact (optional) */
  nestingPlan?: ArtifactRef;

  /** DXF file artifacts */
  dxf?: ArtifactRef[];
}

/**
 * File entry for packet verification.
 *
 * Used by monolith-verify to verify all files in the packet.
 */
export interface ManifestFileEntry {
  /** Relative path within packet (e.g., "gcode/sheet_01.nc") */
  path: string;

  /** SHA-256 hash of file content (lowercase hex, 64 chars) */
  sha256Hex: string;
}

/**
 * Toolpath section.
 */
export interface ManifestToolpath {
  /** Tool change plan artifact (from 10.6.9) */
  toolChangePlan: ArtifactRef;

  /** IR program artifacts (per sheet) */
  irPrograms: ArtifactRef[];

  /** NC file artifacts (per sheet or per tool) */
  ncFiles: ArtifactRef[];

  /**
   * Files for packet verification.
   *
   * Contains ALL verifiable files in the factory packet.
   * Used by monolith-verify to verify packet integrity.
   *
   * v0.10.8.5 - Cross-Language Signing
   */
  files?: ManifestFileEntry[];
}

/**
 * Gate verification section.
 */
export interface ManifestGate {
  /** Gate report artifact */
  gateReport: ArtifactRef;

  /** Simulation report artifacts */
  simReports: ArtifactRef[];

  /** Verifier report artifacts */
  verifierReports: ArtifactRef[];

  /** Consistency report artifacts */
  consistencyReports: ArtifactRef[];
}

/**
 * Chain-of-custody section.
 */
export interface ManifestChain {
  /** SHA-256 of manifest content (excluding chain & signature) */
  manifestHash: HashRef;

  /** Parent manifest hash (for lineage tracking) */
  parentManifestHash?: HashRef;

  /** Build number (increments on regeneration) */
  buildNumber?: number;
}

/**
 * Toolpath Manifest v1.
 *
 * Complete chain-of-custody manifest for factory export.
 */
export interface ToolpathManifestV1 {
  /** Schema version */
  version: "1.0";

  /** Creation timestamp (ISO 8601) */
  createdAtIso: string;

  /** Job information */
  job: ManifestJob;

  /** Manufacturing truth */
  manufacturingTruth: ManifestManufacturingTruth;

  /** Toolpath artifacts */
  toolpath: ManifestToolpath;

  /** Gate verification */
  gate: ManifestGate;

  /** Chain-of-custody */
  chain: ManifestChain;

  /** Signature block */
  signature: SignatureBlock;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Create a hash reference.
 */
export function createHashRef(hex: string): HashRef {
  return { algo: "SHA-256", hex: hex.toLowerCase() };
}

/**
 * Create an artifact reference.
 */
export function createArtifactRef(
  kind: ArtifactKind,
  id: string,
  hashHex: string,
  meta?: Record<string, unknown>
): ArtifactRef {
  return {
    kind,
    id,
    hash: createHashRef(hashHex),
    meta,
  };
}

/**
 * Create an empty signature block.
 */
export function createEmptySignatureBlock(): SignatureBlock {
  return { scheme: "NONE" };
}

/**
 * Check if manifest is signed.
 */
export function isManifestSigned(manifest: ToolpathManifestV1): boolean {
  return (
    manifest.signature.scheme !== "NONE" &&
    !!manifest.signature.signatureHex &&
    manifest.signature.signatureHex.length > 0
  );
}

/**
 * Get all artifact refs from manifest.
 */
export function getAllArtifactRefs(manifest: ToolpathManifestV1): ArtifactRef[] {
  const refs: ArtifactRef[] = [];

  // Job
  refs.push(manifest.job.specSnapshot);

  // Manufacturing truth
  refs.push(manifest.manufacturingTruth.opGraph);
  if (manifest.manufacturingTruth.nestingPlan) {
    refs.push(manifest.manufacturingTruth.nestingPlan);
  }
  if (manifest.manufacturingTruth.dxf) {
    refs.push(...manifest.manufacturingTruth.dxf);
  }

  // Toolpath
  refs.push(manifest.toolpath.toolChangePlan);
  refs.push(...manifest.toolpath.irPrograms);
  refs.push(...manifest.toolpath.ncFiles);

  // Gate
  refs.push(manifest.gate.gateReport);
  refs.push(...manifest.gate.simReports);
  refs.push(...manifest.gate.verifierReports);
  refs.push(...manifest.gate.consistencyReports);

  return refs;
}

/**
 * Get artifact ref by kind and id.
 */
export function findArtifactRef(
  manifest: ToolpathManifestV1,
  kind: ArtifactKind,
  id: string
): ArtifactRef | undefined {
  return getAllArtifactRefs(manifest).find(
    (ref) => ref.kind === kind && ref.id === id
  );
}

/**
 * Create a manifest file entry.
 *
 * @param path Relative path within packet
 * @param sha256Hex SHA-256 hash (will be lowercased)
 */
export function createManifestFileEntry(
  path: string,
  sha256Hex: string
): ManifestFileEntry {
  return {
    path: path.replace(/\\/g, "/"), // Normalize to forward slashes
    sha256Hex: sha256Hex.toLowerCase(),
  };
}

/**
 * Get all file entries from manifest.
 */
export function getManifestFiles(manifest: ToolpathManifestV1): ManifestFileEntry[] {
  return manifest.toolpath.files ?? [];
}

// =============================================================================
// PACK STRUCTURE
// =============================================================================

/**
 * Factory pack file structure.
 *
 * Deterministic directory layout for factory export.
 */
export interface FactoryPackStructure {
  /** Root directory name */
  rootDir: string;

  /** Manifest file path */
  manifestPath: string;

  /** Reports directory */
  reportsDir: string;

  /** IR programs directory */
  irDir: string;

  /** G-code/NC files directory */
  gcodeDir: string;

  /** DXF files directory */
  dxfDir: string;

  /** Hashes manifest file */
  hashesPath: string;
}

/**
 * Get standard factory pack structure.
 */
export function getFactoryPackStructure(jobId: string): FactoryPackStructure {
  const rootDir = `job_${jobId}`;

  return {
    rootDir,
    manifestPath: `${rootDir}/manifest.toolpath.v1.json`,
    reportsDir: `${rootDir}/reports`,
    irDir: `${rootDir}/ir`,
    gcodeDir: `${rootDir}/gcode`,
    dxfDir: `${rootDir}/dxf`,
    hashesPath: `${rootDir}/hashes/files.sha256.txt`,
  };
}
