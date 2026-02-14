// src/core/manufacturing/manifest/buildToolpathManifest.ts
/**
 * Toolpath Manifest Builder.
 *
 * Deterministic manifest construction with SHA-256 chain.
 *
 * Key principles:
 * - manifestHash is computed from content only (no chain/signature)
 * - All inputs must provide pre-computed hashes
 * - Stable stringify ensures reproducible hashes
 *
 * v0.10.8.3 - Signed Toolpath Manifest
 */

import {
  ToolpathManifestV1,
  ArtifactRef,
  ManifestSpecState,
  SignatureBlock,
  createHashRef,
  createArtifactRef,
  createEmptySignatureBlock,
} from "./toolpathManifest.v1";
import { stableStringify, sha256 } from "../audit/hashing";

// =============================================================================
// BUILD REQUEST
// =============================================================================

/**
 * Request to build a toolpath manifest.
 */
export interface BuildManifestRequest {
  // -------------------------------------------------------------------------
  // Timestamps
  // -------------------------------------------------------------------------

  /** Creation timestamp (ISO 8601) */
  createdAtIso: string;

  // -------------------------------------------------------------------------
  // Job info
  // -------------------------------------------------------------------------

  /** Job identifier */
  jobId: string;

  /** Project identifier (optional) */
  projectId?: string;

  /** Spec state */
  specState: ManifestSpecState;

  // -------------------------------------------------------------------------
  // Chain lineage
  // -------------------------------------------------------------------------

  /** Parent manifest hash (for rebuild tracking) */
  parentManifestHashHex?: string;

  /** Build number */
  buildNumber?: number;

  // -------------------------------------------------------------------------
  // Artifacts (pre-hashed)
  // -------------------------------------------------------------------------

  /** Spec snapshot */
  specSnapshot: ArtifactRef;

  /** Operation graph */
  opGraph: ArtifactRef;

  /** Nesting plan (optional) */
  nestingPlan?: ArtifactRef;

  /** DXF files */
  dxf?: ArtifactRef[];

  /** Tool change plan */
  toolChangePlan: ArtifactRef;

  /** IR programs (per sheet) */
  irPrograms: ArtifactRef[];

  /** NC files (per sheet) */
  ncFiles: ArtifactRef[];

  /** Gate report */
  gateReport: ArtifactRef;

  /** Simulation reports */
  simReports: ArtifactRef[];

  /** Verifier reports */
  verifierReports: ArtifactRef[];

  /** Consistency reports */
  consistencyReports: ArtifactRef[];
}

/**
 * Result of manifest building.
 */
export interface BuildManifestResult {
  /** Built manifest */
  manifest: ToolpathManifestV1;

  /** Content hash (for signing) */
  contentHash: string;

  /** Stable JSON of manifest (for storage) */
  manifestJson: string;
}

// =============================================================================
// BUILDER
// =============================================================================

/**
 * Build toolpath manifest from artifacts.
 *
 * @param req Build request with all artifact refs
 * @returns Built manifest with computed hash
 */
export async function buildToolpathManifest(
  req: BuildManifestRequest
): Promise<BuildManifestResult> {
  // 1) Assemble unsigned manifest (without chain.manifestHash and signature)
  const unsignedContent = {
    version: "1.0" as const,
    createdAtIso: req.createdAtIso,

    job: {
      jobId: req.jobId,
      projectId: req.projectId,
      specState: req.specState,
      specSnapshot: req.specSnapshot,
    },

    manufacturingTruth: {
      opGraph: req.opGraph,
      nestingPlan: req.nestingPlan,
      dxf: req.dxf ?? [],
    },

    toolpath: {
      toolChangePlan: req.toolChangePlan,
      irPrograms: req.irPrograms,
      ncFiles: req.ncFiles,
    },

    gate: {
      gateReport: req.gateReport,
      simReports: req.simReports,
      verifierReports: req.verifierReports,
      consistencyReports: req.consistencyReports,
    },
  };

  // 2) Compute content hash
  const contentStr = stableStringify(unsignedContent);
  const contentHash = await sha256(contentStr);

  // 3) Build chain section
  const chain = {
    manifestHash: createHashRef(contentHash),
    parentManifestHash: req.parentManifestHashHex
      ? createHashRef(req.parentManifestHashHex)
      : undefined,
    buildNumber: req.buildNumber,
  };

  // 4) Assemble complete manifest
  const manifest: ToolpathManifestV1 = {
    ...unsignedContent,
    chain,
    signature: createEmptySignatureBlock(),
  };

  // 5) Generate stable JSON
  const manifestJson = stableStringify(manifest);

  return {
    manifest,
    contentHash,
    manifestJson,
  };
}

// =============================================================================
// CONVENIENCE BUILDERS
// =============================================================================

/**
 * Create artifact ref from hash.
 *
 * @param kind Artifact kind
 * @param id Artifact ID
 * @param hashHex SHA-256 hash (hex)
 * @param meta Optional metadata
 * @returns Artifact reference
 */
export { createArtifactRef };

/**
 * Build minimal manifest for testing.
 *
 * @param jobId Job identifier
 * @param specHashHex Spec snapshot hash
 * @param ncHashHex NC file hash
 * @returns Minimal manifest
 */
export async function buildMinimalManifest(
  jobId: string,
  specHashHex: string,
  ncHashHex: string
): Promise<BuildManifestResult> {
  const now = new Date().toISOString();
  const placeholderHash = "0".repeat(64);

  return buildToolpathManifest({
    createdAtIso: now,
    jobId,
    specState: "DRAFT",

    specSnapshot: createArtifactRef("SPEC_SNAPSHOT", "spec.json", specHashHex),
    opGraph: createArtifactRef("OPGRAPH", "opgraph.json", placeholderHash),
    toolChangePlan: createArtifactRef("TOOLCHANGE_PLAN", "toolchange.json", placeholderHash),
    irPrograms: [createArtifactRef("IR_PROGRAM", "sheet_01.ir.json", placeholderHash)],
    ncFiles: [createArtifactRef("NC_FILE", "sheet_01.nc", ncHashHex)],
    gateReport: createArtifactRef("GATE_REPORT", "gate.report.json", placeholderHash),
    simReports: [],
    verifierReports: [],
    consistencyReports: [],
  });
}

// =============================================================================
// SIGNING HELPERS
// =============================================================================

/**
 * Attach signature to manifest.
 *
 * Used by server-side signing service.
 *
 * @param manifest Unsigned manifest
 * @param signature Signature block
 * @returns Signed manifest
 */
export function attachSignature(
  manifest: ToolpathManifestV1,
  signature: SignatureBlock
): ToolpathManifestV1 {
  return {
    ...manifest,
    signature,
  };
}

/**
 * Create signature block (for server-side use).
 *
 * @param scheme Signature scheme
 * @param publicKeyId Public key ID
 * @param signatureHex Signature (hex)
 * @returns Signature block
 */
export function createSignatureBlock(
  scheme: "ED25519" | "RSA-PSS",
  publicKeyId: string,
  signatureHex: string,
  signerId?: string
): SignatureBlock {
  return {
    scheme,
    publicKeyId,
    signatureHex,
    signedAtIso: new Date().toISOString(),
    signerId,
  };
}

// =============================================================================
// HASH FILE GENERATION
// =============================================================================

/**
 * Hash file entry.
 */
export interface HashFileEntry {
  /** File path (relative) */
  path: string;

  /** SHA-256 hash (hex) */
  hashHex: string;
}

/**
 * Generate hashes file content (files.sha256.txt).
 *
 * Format: `<hex>  <path>\n` (two spaces, like sha256sum)
 *
 * @param entries File entries
 * @returns Hash file content
 */
export function generateHashesFile(entries: HashFileEntry[]): string {
  // Sort by path for determinism
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  return sorted.map((e) => `${e.hashHex}  ${e.path}`).join("\n") + "\n";
}

/**
 * Extract hash entries from manifest.
 *
 * @param manifest Toolpath manifest
 * @param structure Pack structure
 * @returns Hash file entries
 */
export function extractHashEntries(
  manifest: ToolpathManifestV1,
  rootDir: string
): HashFileEntry[] {
  const entries: HashFileEntry[] = [];

  // Manifest itself
  entries.push({
    path: `${rootDir}/manifest.toolpath.v1.json`,
    hashHex: manifest.chain.manifestHash.hex,
  });

  // Gate report
  entries.push({
    path: `${rootDir}/reports/${manifest.gate.gateReport.id}`,
    hashHex: manifest.gate.gateReport.hash.hex,
  });

  // Sim reports
  for (const ref of manifest.gate.simReports) {
    entries.push({
      path: `${rootDir}/reports/${ref.id}`,
      hashHex: ref.hash.hex,
    });
  }

  // Verifier reports
  for (const ref of manifest.gate.verifierReports) {
    entries.push({
      path: `${rootDir}/reports/${ref.id}`,
      hashHex: ref.hash.hex,
    });
  }

  // Consistency reports
  for (const ref of manifest.gate.consistencyReports) {
    entries.push({
      path: `${rootDir}/reports/${ref.id}`,
      hashHex: ref.hash.hex,
    });
  }

  // IR programs
  for (const ref of manifest.toolpath.irPrograms) {
    entries.push({
      path: `${rootDir}/ir/${ref.id}`,
      hashHex: ref.hash.hex,
    });
  }

  // NC files
  for (const ref of manifest.toolpath.ncFiles) {
    entries.push({
      path: `${rootDir}/gcode/${ref.id}`,
      hashHex: ref.hash.hex,
    });
  }

  // DXF files
  if (manifest.manufacturingTruth.dxf) {
    for (const ref of manifest.manufacturingTruth.dxf) {
      entries.push({
        path: `${rootDir}/dxf/${ref.id}`,
        hashHex: ref.hash.hex,
      });
    }
  }

  return entries;
}
