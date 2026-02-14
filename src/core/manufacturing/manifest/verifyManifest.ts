// src/core/manufacturing/manifest/verifyManifest.ts
/**
 * Toolpath Manifest Verification.
 *
 * Verifies manifest integrity and artifact hashes.
 *
 * Verification layers:
 * 1. Schema validation
 * 2. Content hash verification (manifestHash)
 * 3. Signature verification (when signed)
 * 4. Artifact hash verification (against files)
 *
 * v0.10.8.3 - Signed Toolpath Manifest
 */

import {
  ToolpathManifestV1,
  ArtifactRef,
  HashRef,
  isManifestSigned,
  getAllArtifactRefs,
} from "./toolpathManifest.v1";
import { stableStringify, sha256, verifyHash } from "../audit/hashing";

// =============================================================================
// VERIFICATION TYPES
// =============================================================================

/**
 * Verification severity.
 */
export type ManifestVerifySeverity = "ERROR" | "WARN" | "INFO";

/**
 * Verification issue code.
 */
export type ManifestVerifyIssueCode =
  // Schema issues
  | "INVALID_VERSION"
  | "MISSING_REQUIRED_FIELD"
  | "INVALID_FIELD_TYPE"

  // Hash issues
  | "MANIFEST_HASH_MISMATCH"
  | "ARTIFACT_HASH_MISMATCH"
  | "ARTIFACT_NOT_FOUND"

  // Signature issues
  | "SIGNATURE_MISSING"
  | "SIGNATURE_INVALID"
  | "SIGNATURE_KEY_UNKNOWN"

  // Chain issues
  | "PARENT_MANIFEST_MISSING"
  | "BUILD_NUMBER_REGRESSION"

  // State issues
  | "SPEC_STATE_NOT_RELEASED"
  | "GATE_REPORT_FAILED";

/**
 * Verification issue.
 */
export interface ManifestVerifyIssue {
  /** Issue code */
  code: ManifestVerifyIssueCode;

  /** Severity */
  severity: ManifestVerifySeverity;

  /** Human-readable message */
  message: string;

  /** Artifact ID (if applicable) */
  artifactId?: string;

  /** Expected value (if applicable) */
  expected?: string;

  /** Actual value (if applicable) */
  actual?: string;
}

/**
 * Verification verdict.
 */
export type ManifestVerifyVerdict = "PASS" | "FAIL" | "WARN";

/**
 * Verification result.
 */
export interface ManifestVerifyResult {
  /** Overall verdict */
  verdict: ManifestVerifyVerdict;

  /** Issues found */
  issues: ManifestVerifyIssue[];

  /** Manifest hash verified */
  hashVerified: boolean;

  /** Signature verified (if signed) */
  signatureVerified: boolean | null;

  /** Verified at timestamp */
  verifiedAt: string;
}

// =============================================================================
// CONTENT VERIFICATION
// =============================================================================

/**
 * Verify manifest content hash.
 *
 * @param manifest Manifest to verify
 * @returns True if hash matches
 */
export async function verifyManifestHash(
  manifest: ToolpathManifestV1
): Promise<boolean> {
  // Reconstruct unsigned content (same structure as builder)
  const unsignedContent = {
    version: manifest.version,
    createdAtIso: manifest.createdAtIso,
    job: manifest.job,
    manufacturingTruth: manifest.manufacturingTruth,
    toolpath: manifest.toolpath,
    gate: manifest.gate,
  };

  const contentStr = stableStringify(unsignedContent);
  const computedHash = await sha256(contentStr);

  return computedHash === manifest.chain.manifestHash.hex.toLowerCase();
}

/**
 * Compute manifest content hash (for re-verification).
 *
 * @param manifest Manifest
 * @returns Computed hash (hex)
 */
export async function computeManifestHash(
  manifest: ToolpathManifestV1
): Promise<string> {
  const unsignedContent = {
    version: manifest.version,
    createdAtIso: manifest.createdAtIso,
    job: manifest.job,
    manufacturingTruth: manifest.manufacturingTruth,
    toolpath: manifest.toolpath,
    gate: manifest.gate,
  };

  return sha256(stableStringify(unsignedContent));
}

// =============================================================================
// ARTIFACT VERIFICATION
// =============================================================================

/**
 * Artifact content provider.
 *
 * Returns artifact content for hash verification.
 */
export type ArtifactContentProvider = (
  ref: ArtifactRef
) => Promise<string | null>;

/**
 * Verify single artifact hash.
 *
 * @param ref Artifact reference
 * @param content Artifact content
 * @returns True if hash matches
 */
export async function verifyArtifactHash(
  ref: ArtifactRef,
  content: string
): Promise<boolean> {
  return verifyHash(content, ref.hash.hex);
}

/**
 * Verify all artifact hashes in manifest.
 *
 * @param manifest Manifest
 * @param getContent Content provider
 * @returns Issues found
 */
export async function verifyAllArtifacts(
  manifest: ToolpathManifestV1,
  getContent: ArtifactContentProvider
): Promise<ManifestVerifyIssue[]> {
  const issues: ManifestVerifyIssue[] = [];
  const refs = getAllArtifactRefs(manifest);

  for (const ref of refs) {
    const content = await getContent(ref);

    if (content === null) {
      issues.push({
        code: "ARTIFACT_NOT_FOUND",
        severity: "ERROR",
        message: `Artifact not found: ${ref.kind}/${ref.id}`,
        artifactId: ref.id,
      });
      continue;
    }

    const valid = await verifyArtifactHash(ref, content);
    if (!valid) {
      const actualHash = await sha256(content);
      issues.push({
        code: "ARTIFACT_HASH_MISMATCH",
        severity: "ERROR",
        message: `Hash mismatch for ${ref.kind}/${ref.id}`,
        artifactId: ref.id,
        expected: ref.hash.hex,
        actual: actualHash,
      });
    }
  }

  return issues;
}

// =============================================================================
// SCHEMA VALIDATION
// =============================================================================

/**
 * Validate manifest schema.
 *
 * @param manifest Manifest to validate
 * @returns Issues found
 */
export function validateManifestSchema(
  manifest: unknown
): ManifestVerifyIssue[] {
  const issues: ManifestVerifyIssue[] = [];

  if (!manifest || typeof manifest !== "object") {
    issues.push({
      code: "INVALID_FIELD_TYPE",
      severity: "ERROR",
      message: "Manifest must be an object",
    });
    return issues;
  }

  const m = manifest as Record<string, unknown>;

  // Version
  if (m.version !== "1.0") {
    issues.push({
      code: "INVALID_VERSION",
      severity: "ERROR",
      message: `Invalid version: ${m.version}`,
      expected: "1.0",
      actual: String(m.version),
    });
  }

  // Required fields
  const requiredFields = [
    "createdAtIso",
    "job",
    "manufacturingTruth",
    "toolpath",
    "gate",
    "chain",
    "signature",
  ];

  for (const field of requiredFields) {
    if (!(field in m)) {
      issues.push({
        code: "MISSING_REQUIRED_FIELD",
        severity: "ERROR",
        message: `Missing required field: ${field}`,
      });
    }
  }

  // Job validation
  if (m.job && typeof m.job === "object") {
    const job = m.job as Record<string, unknown>;
    if (!job.jobId) {
      issues.push({
        code: "MISSING_REQUIRED_FIELD",
        severity: "ERROR",
        message: "Missing job.jobId",
      });
    }
  }

  // Chain validation
  if (m.chain && typeof m.chain === "object") {
    const chain = m.chain as Record<string, unknown>;
    if (!chain.manifestHash) {
      issues.push({
        code: "MISSING_REQUIRED_FIELD",
        severity: "ERROR",
        message: "Missing chain.manifestHash",
      });
    }
  }

  return issues;
}

// =============================================================================
// FULL VERIFICATION
// =============================================================================

/**
 * Verification options.
 */
export interface VerifyManifestOptions {
  /** Verify artifact hashes (requires content provider) */
  verifyArtifacts?: boolean;

  /** Artifact content provider */
  getArtifactContent?: ArtifactContentProvider;

  /** Require signature */
  requireSignature?: boolean;

  /** Require RELEASED spec state */
  requireReleased?: boolean;

  /** Verify signature (requires verifier function) */
  verifySignature?: (
    hash: string,
    signatureHex: string,
    publicKeyId: string
  ) => Promise<boolean>;
}

/**
 * Verify manifest completely.
 *
 * @param manifest Manifest to verify
 * @param options Verification options
 * @returns Verification result
 */
export async function verifyManifest(
  manifest: ToolpathManifestV1,
  options: VerifyManifestOptions = {}
): Promise<ManifestVerifyResult> {
  const issues: ManifestVerifyIssue[] = [];

  // 1) Schema validation
  issues.push(...validateManifestSchema(manifest));

  // 2) Content hash verification
  let hashVerified = false;
  if (issues.filter((i) => i.severity === "ERROR").length === 0) {
    hashVerified = await verifyManifestHash(manifest);
    if (!hashVerified) {
      const actualHash = await computeManifestHash(manifest);
      issues.push({
        code: "MANIFEST_HASH_MISMATCH",
        severity: "ERROR",
        message: "Manifest content hash mismatch",
        expected: manifest.chain.manifestHash.hex,
        actual: actualHash,
      });
    }
  }

  // 3) Signature verification
  let signatureVerified: boolean | null = null;
  if (options.requireSignature || isManifestSigned(manifest)) {
    if (!isManifestSigned(manifest)) {
      issues.push({
        code: "SIGNATURE_MISSING",
        severity: options.requireSignature ? "ERROR" : "WARN",
        message: "Manifest is not signed",
      });
    } else if (options.verifySignature) {
      signatureVerified = await options.verifySignature(
        manifest.chain.manifestHash.hex,
        manifest.signature.signatureHex!,
        manifest.signature.publicKeyId!
      );
      if (!signatureVerified) {
        issues.push({
          code: "SIGNATURE_INVALID",
          severity: "ERROR",
          message: "Signature verification failed",
        });
      }
    }
  }

  // 4) Spec state check
  if (options.requireReleased && manifest.job.specState !== "RELEASED") {
    issues.push({
      code: "SPEC_STATE_NOT_RELEASED",
      severity: "ERROR",
      message: `Spec state is ${manifest.job.specState}, expected RELEASED`,
      expected: "RELEASED",
      actual: manifest.job.specState,
    });
  }

  // 5) Artifact verification
  if (options.verifyArtifacts && options.getArtifactContent) {
    const artifactIssues = await verifyAllArtifacts(
      manifest,
      options.getArtifactContent
    );
    issues.push(...artifactIssues);
  }

  // Determine verdict
  const hasErrors = issues.some((i) => i.severity === "ERROR");
  const hasWarnings = issues.some((i) => i.severity === "WARN");
  const verdict: ManifestVerifyVerdict = hasErrors
    ? "FAIL"
    : hasWarnings
      ? "WARN"
      : "PASS";

  return {
    verdict,
    issues,
    hashVerified,
    signatureVerified,
    verifiedAt: new Date().toISOString(),
  };
}

// =============================================================================
// QUICK HELPERS
// =============================================================================

/**
 * Quick manifest hash check.
 *
 * @param manifest Manifest
 * @returns True if valid
 */
export async function quickVerifyManifest(
  manifest: ToolpathManifestV1
): Promise<boolean> {
  const schemaIssues = validateManifestSchema(manifest);
  if (schemaIssues.some((i) => i.severity === "ERROR")) {
    return false;
  }

  return verifyManifestHash(manifest);
}

/**
 * Parse and verify manifest JSON.
 *
 * @param json Manifest JSON string
 * @returns Verification result with parsed manifest
 */
export async function parseAndVerifyManifest(json: string): Promise<{
  manifest: ToolpathManifestV1 | null;
  result: ManifestVerifyResult;
}> {
  let manifest: ToolpathManifestV1 | null = null;

  try {
    manifest = JSON.parse(json) as ToolpathManifestV1;
  } catch (e) {
    return {
      manifest: null,
      result: {
        verdict: "FAIL",
        issues: [
          {
            code: "INVALID_FIELD_TYPE",
            severity: "ERROR",
            message: `Invalid JSON: ${(e as Error).message}`,
          },
        ],
        hashVerified: false,
        signatureVerified: null,
        verifiedAt: new Date().toISOString(),
      },
    };
  }

  const result = await verifyManifest(manifest);

  return { manifest, result };
}
