/**
 * Step 10.8.3: Signed Toolpath Manifest (SHA-256, chain-of-custody, auditable)
 *
 * Creates a cryptographically signed manifest that proves:
 * - Which job snapshot (specState, design hash, material map)
 * - Which machine profile (id+version+fingerprint)
 * - Which toolpath plan (steps + ordering + offsets)
 * - Which motion plan and G-code output
 * - Which verifier/sim results
 *
 * All tied together with SHA-256 hashes and HMAC/Ed25519 signatures.
 *
 * @module toolpathManifest
 * @version 10.8.3
 */

import { createHash, createHmac, createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import type { DialectId } from './gcodeDialects.js';
import type { SimReport } from './simulationKernel.js';
import type { ToolpathVerifyReport } from './toolpathVerifier.js';
import type { ConsistencyReport } from './geometryConsistency.js';
import type { MotionPlanV1 } from './offsetKernel/zAwarePlanning.js';

// ============================================================================
// Types: Core Primitives
// ============================================================================

/** SHA-256 hash in hex format */
export type Hash256 = string;

/** Spec workflow state */
export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

/** Signing method */
export type SigningMethod = 'HMAC_SHA256' | 'ED25519';

// ============================================================================
// Types: Manifest V1 Structure
// ============================================================================

/**
 * Job information section
 */
export interface ManifestJob {
  jobId: string;
  specState: SpecState;
  /** Hash of approved design intent snapshot */
  designFingerprint: string;
  /** Hash of toolpath plan (sheetId + parts) */
  sheetFingerprint: string;
}

/**
 * Machine configuration section
 */
export interface ManifestMachine {
  machineProfileId: string;
  machineProfileVersion: string;
  /** Stable JSON fingerprint of machine profile */
  machineProfileFingerprint: string;
  dialect: DialectId;
}

/**
 * Step pin for traceability
 */
export interface ManifestStepPin {
  stepId: string;
  partId: string;
  opKind: string;
  passKind: string;
  toolId: string;
  offsetFp?: string;
  entryExitFp?: string;
  /** Combined profile fingerprint from resolveParams() */
  combinedProfileFp: string;
}

/**
 * Planning section
 */
export interface ManifestPlanning {
  /** Tool change planner fingerprint (10.6.9) */
  toolChangePlanFingerprint: string;
  /** Per-step pins for traceability */
  stepPins: ManifestStepPin[];
}

/**
 * Single artifact report summary
 */
export interface ManifestReportSummary {
  fingerprint: string;
  kind: 'OK' | 'BLOCK';
  reportHash: Hash256;
}

/**
 * Artifacts section (hashes of all outputs)
 */
export interface ManifestArtifacts {
  /** Hash of geometry truth JSON (optional) */
  geometryTruthHash: Hash256;
  /** Hash of motion plan JSON */
  motionPlanHash: Hash256;
  /** Hash of G-code output */
  gcodeHash: Hash256;
  /** Simulation report summary */
  sim: ManifestReportSummary;
  /** Toolpath verifier report (10.8.1) */
  verify_10_8_1: ManifestReportSummary;
  /** Geometry consistency report (10.8.2) */
  consistency_10_8_2: ManifestReportSummary;
}

/**
 * Gate decision
 */
export interface ManifestDecision {
  gateKind: 'PASS' | 'BLOCK';
  /** Sorted list of block reasons */
  reasons: string[];
}

/**
 * Cryptographic signatures
 */
export interface ManifestSignatures {
  /** SHA-256 hash of unsigned manifest JSON */
  manifestHash: Hash256;
  /** Signing method used */
  method: SigningMethod;
  /** Key identifier */
  keyId: string;
  /** Signature (hex for HMAC, base64 for Ed25519) */
  signature: string;
}

/**
 * Complete Manifest V1 structure
 */
export interface ManifestV1 {
  schema: 'monolith.toolpath-manifest.v1';
  /** Creation timestamp (from snapshot, not realtime) */
  createdAtISO: string;
  job: ManifestJob;
  machine: ManifestMachine;
  planning: ManifestPlanning;
  artifacts: ManifestArtifacts;
  decision: ManifestDecision;
  signatures: ManifestSignatures;
}

/**
 * Unsigned manifest (before signing)
 */
export type UnsignedManifestV1 = Omit<ManifestV1, 'signatures'>;

// ============================================================================
// Stable JSON Serialization (Canonical)
// ============================================================================

/**
 * Recursively sort object keys for stable serialization
 */
function stabilize(v: unknown): unknown {
  if (v === null || typeof v !== 'object') {
    return v;
  }

  if (Array.isArray(v)) {
    return v.map(stabilize);
  }

  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};

  for (const k of keys) {
    out[k] = stabilize(obj[k]);
  }

  return out;
}

/**
 * Serialize to canonical JSON (sorted keys, no whitespace variance)
 */
export function stableJson(x: unknown): string {
  return JSON.stringify(stabilize(x));
}

/**
 * Normalize G-code for consistent hashing
 * - Convert CRLF to LF
 * - Trim trailing whitespace from each line
 * - Ensure single trailing newline
 */
export function normalizeGcode(g: string): string {
  return g
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trimEnd())
    .join('\n')
    .trimEnd() + '\n';
}

// ============================================================================
// SHA-256 Hashing Utilities
// ============================================================================

/**
 * Compute SHA-256 hash of string or buffer, return hex
 */
export function sha256Hex(data: string | Buffer): Hash256 {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute HMAC-SHA256, return hex
 */
export function hmacSha256Hex(secret: string, data: string): Hash256 {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Hash any JSON-serializable object
 */
export function hashJson(obj: unknown): Hash256 {
  return sha256Hex(stableJson(obj));
}

// ============================================================================
// Gate Decision Computation
// ============================================================================

/**
 * Block reason codes
 */
export const BLOCK_REASON = {
  SIM_BLOCK: 'SIM_BLOCK',
  VERIFY_BLOCK: 'VERIFY_BLOCK',
  CONSISTENCY_BLOCK: 'CONSISTENCY_BLOCK',
  NOT_RELEASED: 'NOT_RELEASED',
  MISSING_ARTIFACTS: 'MISSING_ARTIFACTS',
  SIGNATURE_INVALID: 'SIGNATURE_INVALID',
} as const;

/**
 * Input for gate decision computation
 */
export interface GateDecisionInput {
  specState: SpecState;
  simKind: 'OK' | 'BLOCK';
  verifyKind: 'OK' | 'BLOCK';
  consistencyKind: 'OK' | 'BLOCK';
}

/**
 * Compute gate decision from verification results
 */
export function computeGateDecision(args: GateDecisionInput): ManifestDecision {
  const reasons: string[] = [];

  if (args.simKind === 'BLOCK') {
    reasons.push(BLOCK_REASON.SIM_BLOCK);
  }
  if (args.verifyKind === 'BLOCK') {
    reasons.push(BLOCK_REASON.VERIFY_BLOCK);
  }
  if (args.consistencyKind === 'BLOCK') {
    reasons.push(BLOCK_REASON.CONSISTENCY_BLOCK);
  }
  if (args.specState !== 'RELEASED') {
    reasons.push(BLOCK_REASON.NOT_RELEASED);
  }

  // Sort for determinism
  reasons.sort();

  return {
    gateKind: reasons.length > 0 ? 'BLOCK' : 'PASS',
    reasons,
  };
}

// ============================================================================
// Manifest Building
// ============================================================================

/**
 * Input for building a manifest
 */
export interface BuildManifestInput {
  /** Pinned timestamp from GateContext (not realtime) */
  snapshotTimeISO: string;

  /** Job information */
  job: ManifestJob;

  /** Machine configuration */
  machine: ManifestMachine;

  /** Tool change plan fingerprint (from 10.6.9) */
  toolChangePlanFingerprint: string;

  /** Step pins for traceability */
  stepPins: ManifestStepPin[];

  /** Geometry truth JSON (optional) */
  geometryTruthJson?: unknown;

  /** Motion plan */
  motionPlan: MotionPlanV1;

  /** G-code output */
  gcode: string;

  /** Simulation report */
  simReport: SimReport;

  /** Toolpath verifier report */
  verifyReport: ToolpathVerifyReport;

  /** Geometry consistency report */
  consistencyReport: ConsistencyReport;

  /** Signing configuration */
  signing: {
    method: SigningMethod;
    keyId: string;
    /** HMAC secret (required for HMAC_SHA256) */
    secret?: string;
    /** Ed25519 private key (required for ED25519) - base64 encoded */
    privateKey?: string;
  };
}

/**
 * Build and sign a manifest
 */
export function buildManifestV1(inp: BuildManifestInput): ManifestV1 {
  // Hash all artifacts
  const motionJson = stableJson(inp.motionPlan);
  const gcodeNorm = normalizeGcode(inp.gcode);

  const geometryTruthHash = inp.geometryTruthJson
    ? sha256Hex(stableJson(inp.geometryTruthJson))
    : sha256Hex('');

  const motionPlanHash = sha256Hex(motionJson);
  const gcodeHash = sha256Hex(gcodeNorm);

  // Hash reports
  const simHash = sha256Hex(stableJson(inp.simReport));
  const verifyHash = sha256Hex(stableJson(inp.verifyReport));
  const consHash = sha256Hex(stableJson(inp.consistencyReport));

  // Compute gate decision
  const decision = computeGateDecision({
    specState: inp.job.specState,
    simKind: inp.simReport.kind,
    verifyKind: inp.verifyReport.kind,
    consistencyKind: inp.consistencyReport.kind,
  });

  // Build unsigned manifest
  const unsigned: UnsignedManifestV1 = {
    schema: 'monolith.toolpath-manifest.v1',
    createdAtISO: inp.snapshotTimeISO,
    job: inp.job,
    machine: inp.machine,
    planning: {
      toolChangePlanFingerprint: inp.toolChangePlanFingerprint,
      stepPins: inp.stepPins,
    },
    artifacts: {
      geometryTruthHash,
      motionPlanHash,
      gcodeHash,
      sim: {
        fingerprint: inp.simReport.fingerprint,
        kind: inp.simReport.kind,
        reportHash: simHash,
      },
      verify_10_8_1: {
        fingerprint: inp.verifyReport.fingerprint,
        kind: inp.verifyReport.kind,
        reportHash: verifyHash,
      },
      consistency_10_8_2: {
        fingerprint: inp.consistencyReport.fingerprint,
        kind: inp.consistencyReport.kind,
        reportHash: consHash,
      },
    },
    decision,
  };

  // Compute manifest hash
  const unsignedJson = stableJson(unsigned);
  const manifestHash = sha256Hex(unsignedJson);

  // Sign the manifest hash
  let signature = '';

  if (inp.signing.method === 'HMAC_SHA256') {
    if (!inp.signing.secret) {
      throw new Error('Missing HMAC secret for signing');
    }
    signature = hmacSha256Hex(inp.signing.secret, manifestHash);
  } else if (inp.signing.method === 'ED25519') {
    if (!inp.signing.privateKey) {
      throw new Error('Missing Ed25519 private key for signing');
    }
    // Ed25519 signing using Node.js crypto
    // Private key is expected to be base64-encoded PKCS8 format
    try {
      const keyBuffer = Buffer.from(inp.signing.privateKey, 'base64');
      const privateKey = createPrivateKey({
        key: keyBuffer,
        format: 'der',
        type: 'pkcs8',
      });

      // Sign the manifest hash (hex string) as UTF-8 bytes
      const signatureBuffer = sign(null, Buffer.from(manifestHash, 'utf-8'), privateKey);
      signature = signatureBuffer.toString('base64');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      throw new Error(`Ed25519 signing failed: ${message}`);
    }
  }

  return {
    ...unsigned,
    signatures: {
      manifestHash,
      method: inp.signing.method,
      keyId: inp.signing.keyId,
      signature,
    },
  };
}

// ============================================================================
// Manifest Verification
// ============================================================================

/**
 * Result of manifest verification
 */
export interface ManifestVerifyResult {
  valid: boolean;
  manifestHashMatch: boolean;
  signatureValid: boolean;
  errors: string[];
}

/**
 * Verify manifest integrity and signature (HMAC)
 */
export function verifyManifestHmac(manifest: ManifestV1, secret: string): ManifestVerifyResult {
  const errors: string[] = [];

  // Extract unsigned portion
  const { signatures, ...unsigned } = manifest;

  // Recompute manifest hash
  const unsignedJson = stableJson(unsigned);
  const computedHash = sha256Hex(unsignedJson);

  const manifestHashMatch = computedHash === manifest.signatures.manifestHash;
  if (!manifestHashMatch) {
    errors.push(`Manifest hash mismatch: computed=${computedHash.slice(0, 16)}..., stored=${manifest.signatures.manifestHash.slice(0, 16)}...`);
  }

  // Verify signature
  if (manifest.signatures.method !== 'HMAC_SHA256') {
    errors.push(`Unsupported signing method: ${manifest.signatures.method}`);
    return { valid: false, manifestHashMatch, signatureValid: false, errors };
  }

  const expectedSig = hmacSha256Hex(secret, manifest.signatures.manifestHash);
  const signatureValid = expectedSig === manifest.signatures.signature;

  if (!signatureValid) {
    errors.push('HMAC signature verification failed');
  }

  return {
    valid: manifestHashMatch && signatureValid,
    manifestHashMatch,
    signatureValid,
    errors,
  };
}

/**
 * Verify manifest integrity and Ed25519 signature
 *
 * @param manifest - The manifest to verify
 * @param publicKeyBase64 - Base64-encoded Ed25519 public key (SPKI format)
 */
export function verifyManifestEd25519(manifest: ManifestV1, publicKeyBase64: string): ManifestVerifyResult {
  const errors: string[] = [];

  // Extract unsigned portion
  const { signatures, ...unsigned } = manifest;

  // Recompute manifest hash
  const unsignedJson = stableJson(unsigned);
  const computedHash = sha256Hex(unsignedJson);

  const manifestHashMatch = computedHash === manifest.signatures.manifestHash;
  if (!manifestHashMatch) {
    errors.push(`Manifest hash mismatch: computed=${computedHash.slice(0, 16)}..., stored=${manifest.signatures.manifestHash.slice(0, 16)}...`);
  }

  // Verify signature method
  if (manifest.signatures.method !== 'ED25519') {
    errors.push(`Unsupported signing method for Ed25519 verification: ${manifest.signatures.method}`);
    return { valid: false, manifestHashMatch, signatureValid: false, errors };
  }

  // Verify Ed25519 signature
  let signatureValid = false;
  try {
    const keyBuffer = Buffer.from(publicKeyBase64, 'base64');
    const publicKey = createPublicKey({
      key: keyBuffer,
      format: 'der',
      type: 'spki',
    });

    const signatureBuffer = Buffer.from(manifest.signatures.signature, 'base64');
    signatureValid = verify(
      null,
      Buffer.from(manifest.signatures.manifestHash, 'utf-8'),
      publicKey,
      signatureBuffer
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    errors.push(`Ed25519 verification failed: ${message}`);
  }

  if (!signatureValid) {
    errors.push('Ed25519 signature verification failed');
  }

  return {
    valid: manifestHashMatch && signatureValid,
    manifestHashMatch,
    signatureValid,
    errors,
  };
}

/**
 * Verify that G-code matches manifest hash
 */
export function verifyGcodeHash(manifest: ManifestV1, gcode: string): boolean {
  const normalizedGcode = normalizeGcode(gcode);
  const computedHash = sha256Hex(normalizedGcode);
  return computedHash === manifest.artifacts.gcodeHash;
}

/**
 * Verify that motion plan matches manifest hash
 */
export function verifyMotionPlanHash(manifest: ManifestV1, motionPlan: MotionPlanV1): boolean {
  const computedHash = hashJson(motionPlan);
  return computedHash === manifest.artifacts.motionPlanHash;
}

/**
 * Comprehensive manifest verification
 */
export interface FullVerifyInput {
  manifest: ManifestV1;
  secret: string;
  gcode?: string;
  motionPlan?: MotionPlanV1;
}

export interface FullVerifyResult {
  valid: boolean;
  signatureValid: boolean;
  gcodeHashValid?: boolean;
  motionPlanHashValid?: boolean;
  gateDecisionValid: boolean;
  errors: string[];
}

export function verifyManifestFull(inp: FullVerifyInput): FullVerifyResult {
  const errors: string[] = [];

  // Verify signature
  const sigResult = verifyManifestHmac(inp.manifest, inp.secret);
  if (!sigResult.valid) {
    errors.push(...sigResult.errors);
  }

  // Verify G-code hash if provided
  let gcodeHashValid: boolean | undefined;
  if (inp.gcode !== undefined) {
    gcodeHashValid = verifyGcodeHash(inp.manifest, inp.gcode);
    if (!gcodeHashValid) {
      errors.push('G-code hash mismatch');
    }
  }

  // Verify motion plan hash if provided
  let motionPlanHashValid: boolean | undefined;
  if (inp.motionPlan !== undefined) {
    motionPlanHashValid = verifyMotionPlanHash(inp.manifest, inp.motionPlan);
    if (!motionPlanHashValid) {
      errors.push('Motion plan hash mismatch');
    }
  }

  // Verify gate decision consistency
  const recomputedDecision = computeGateDecision({
    specState: inp.manifest.job.specState,
    simKind: inp.manifest.artifacts.sim.kind,
    verifyKind: inp.manifest.artifacts.verify_10_8_1.kind,
    consistencyKind: inp.manifest.artifacts.consistency_10_8_2.kind,
  });

  const gateDecisionValid =
    recomputedDecision.gateKind === inp.manifest.decision.gateKind &&
    JSON.stringify(recomputedDecision.reasons) === JSON.stringify(inp.manifest.decision.reasons);

  if (!gateDecisionValid) {
    errors.push('Gate decision inconsistent with artifact states');
  }

  const valid =
    sigResult.valid &&
    (gcodeHashValid === undefined || gcodeHashValid) &&
    (motionPlanHashValid === undefined || motionPlanHashValid) &&
    gateDecisionValid;

  return {
    valid,
    signatureValid: sigResult.valid,
    gcodeHashValid,
    motionPlanHashValid,
    gateDecisionValid,
    errors,
  };
}

// ============================================================================
// Export ID Generation
// ============================================================================

/**
 * Generate deterministic export ID from manifest hash and job ID
 */
export function generateExportId(manifestHash: Hash256, jobId: string): string {
  return sha256Hex(`${manifestHash}:${jobId}`).slice(0, 16);
}

/**
 * Generate export path for artifact storage
 */
export function generateExportPath(jobId: string, exportId: string, filename: string): string {
  return `jobs/${jobId}/exports/${exportId}/${filename}`;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if manifest allows export (PASS gate)
 */
export function canExport(manifest: ManifestV1): boolean {
  return manifest.decision.gateKind === 'PASS';
}

/**
 * Get list of blocking reasons
 */
export function getBlockReasons(manifest: ManifestV1): string[] {
  return manifest.decision.reasons;
}

/**
 * Check if specific verification passed
 */
export function isSimPassed(manifest: ManifestV1): boolean {
  return manifest.artifacts.sim.kind === 'OK';
}

export function isVerifyPassed(manifest: ManifestV1): boolean {
  return manifest.artifacts.verify_10_8_1.kind === 'OK';
}

export function isConsistencyPassed(manifest: ManifestV1): boolean {
  return manifest.artifacts.consistency_10_8_2.kind === 'OK';
}

/**
 * Summarize manifest for logging/display
 */
export function summarizeManifest(manifest: ManifestV1): string {
  const lines: string[] = [
    `Toolpath Manifest v1`,
    `  Schema: ${manifest.schema}`,
    `  Created: ${manifest.createdAtISO}`,
    ``,
    `Job:`,
    `  ID: ${manifest.job.jobId}`,
    `  Spec State: ${manifest.job.specState}`,
    `  Design FP: ${manifest.job.designFingerprint.slice(0, 16)}...`,
    ``,
    `Machine:`,
    `  Profile: ${manifest.machine.machineProfileId} v${manifest.machine.machineProfileVersion}`,
    `  Dialect: ${manifest.machine.dialect}`,
    ``,
    `Planning:`,
    `  Steps: ${manifest.planning.stepPins.length}`,
    `  Tool Change FP: ${manifest.planning.toolChangePlanFingerprint.slice(0, 16)}...`,
    ``,
    `Artifacts:`,
    `  Motion Plan Hash: ${manifest.artifacts.motionPlanHash.slice(0, 16)}...`,
    `  G-code Hash: ${manifest.artifacts.gcodeHash.slice(0, 16)}...`,
    `  Sim: ${manifest.artifacts.sim.kind}`,
    `  Verify: ${manifest.artifacts.verify_10_8_1.kind}`,
    `  Consistency: ${manifest.artifacts.consistency_10_8_2.kind}`,
    ``,
    `Decision:`,
    `  Gate: ${manifest.decision.gateKind}`,
    `  Reasons: ${manifest.decision.reasons.length > 0 ? manifest.decision.reasons.join(', ') : '(none)'}`,
    ``,
    `Signatures:`,
    `  Method: ${manifest.signatures.method}`,
    `  Key ID: ${manifest.signatures.keyId}`,
    `  Manifest Hash: ${manifest.signatures.manifestHash.slice(0, 16)}...`,
  ];

  return lines.join('\n');
}

/**
 * Create a minimal manifest job object
 */
export function createManifestJob(
  jobId: string,
  specState: SpecState,
  designFingerprint: string,
  sheetFingerprint: string
): ManifestJob {
  return { jobId, specState, designFingerprint, sheetFingerprint };
}

/**
 * Create a manifest machine object
 */
export function createManifestMachine(
  machineProfileId: string,
  machineProfileVersion: string,
  machineProfileFingerprint: string,
  dialect: DialectId
): ManifestMachine {
  return { machineProfileId, machineProfileVersion, machineProfileFingerprint, dialect };
}

/**
 * Create a step pin
 */
export function createStepPin(
  stepId: string,
  partId: string,
  opKind: string,
  passKind: string,
  toolId: string,
  combinedProfileFp: string,
  options?: { offsetFp?: string; entryExitFp?: string }
): ManifestStepPin {
  return {
    stepId,
    partId,
    opKind,
    passKind,
    toolId,
    combinedProfileFp,
    offsetFp: options?.offsetFp,
    entryExitFp: options?.entryExitFp,
  };
}

/**
 * Create signing config for HMAC
 */
export function createHmacSigningConfig(keyId: string, secret: string): BuildManifestInput['signing'] {
  return {
    method: 'HMAC_SHA256',
    keyId,
    secret,
  };
}

/**
 * Create signing config for Ed25519
 *
 * @param keyId - Key identifier for tracking/rotation
 * @param privateKeyBase64 - Base64-encoded Ed25519 private key (PKCS8 format)
 */
export function createEd25519SigningConfig(keyId: string, privateKeyBase64: string): BuildManifestInput['signing'] {
  return {
    method: 'ED25519',
    keyId,
    privateKey: privateKeyBase64,
  };
}

/**
 * Extract key manifest info for quick comparison
 */
export function extractManifestSummary(manifest: ManifestV1): {
  jobId: string;
  specState: SpecState;
  gateKind: 'PASS' | 'BLOCK';
  manifestHash: Hash256;
  gcodeHash: Hash256;
} {
  return {
    jobId: manifest.job.jobId,
    specState: manifest.job.specState,
    gateKind: manifest.decision.gateKind,
    manifestHash: manifest.signatures.manifestHash,
    gcodeHash: manifest.artifacts.gcodeHash,
  };
}

/**
 * Compare two manifests for equality (by hash)
 */
export function manifestsEqual(a: ManifestV1, b: ManifestV1): boolean {
  return a.signatures.manifestHash === b.signatures.manifestHash;
}

/**
 * Parse manifest from JSON string
 */
export function parseManifest(json: string): ManifestV1 {
  const parsed = JSON.parse(json);

  if (parsed.schema !== 'monolith.toolpath-manifest.v1') {
    throw new Error(`Unknown manifest schema: ${parsed.schema}`);
  }

  return parsed as ManifestV1;
}

/**
 * Serialize manifest to JSON string
 */
export function serializeManifest(manifest: ManifestV1): string {
  return stableJson(manifest);
}
