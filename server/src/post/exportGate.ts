/**
 * Step 10.8.4: Export Gate Enforcement (Only RELEASED + Verified Chain can export)
 *
 * Enforces the North-Star trust chain:
 * - Only RELEASED specs can export
 * - Gate decision must be PASS
 * - Machine profile must match pin
 * - Manifest signature must be valid
 *
 * Single entry point for all factory exports with full audit trail.
 *
 * @module exportGate
 * @version 10.8.4
 */

import type { ManifestV1, Hash256, SpecState } from './toolpathManifest.js';
import type { SimReport } from './simulationKernel.js';
import type { ToolpathVerifyReport } from './toolpathVerifier.js';
import type { ConsistencyReport } from './geometryConsistency.js';
import type { MotionPlanV1 } from './offsetKernel/zAwarePlanning.js';
import type { DialectId } from './gcodeDialects.js';
import {
  verifyManifestHmac,
  stableJson,
  sha256Hex,
  generateExportId,
} from './toolpathManifest.js';

// ============================================================================
// Types: Export Request
// ============================================================================

/** Types of exports supported */
export type ExportKind = 'GCODE' | 'DXF' | 'CSV_CUTLIST' | 'BUNDLE_ZIP';

/** Actor who triggered the export */
export interface ExportActor {
  type: 'USER' | 'CI' | 'API' | 'SYSTEM';
  id: string;
  name?: string;
}

/** Request to export job artifacts */
export interface ExportRequest {
  jobId: string;
  kind: ExportKind;
  machineProfileId: string;
  machineProfileVersion: string;
  /** Force re-run verification (default true for safety) */
  requireFreshVerify: boolean;
  /** Who/what triggered export (audit) */
  actor: ExportActor;
}

// ============================================================================
// Types: Export Result
// ============================================================================

/** File in export bundle */
export interface ExportFile {
  path: string;
  sha256: Hash256;
  sizeBytes?: number;
}

/** Successful export result */
export interface ExportResultOK {
  kind: 'OK';
  exportId: string;
  manifest: ManifestV1;
  files: ExportFile[];
  auditEntryId: string;
}

/** Blocked export result */
export interface ExportResultBlock {
  kind: 'BLOCK';
  reasons: string[];
  report: {
    sim?: SimReport;
    verify?: ToolpathVerifyReport;
    consistency?: ConsistencyReport;
  };
}

/** Export result union */
export type ExportResult = ExportResultOK | ExportResultBlock;

// ============================================================================
// Types: Job Snapshot (Pinned State)
// ============================================================================

/** Machine profile pin */
export interface MachinePin {
  machineProfileId: string;
  machineProfileVersion: string;
}

/** Gate run result stored in snapshot */
export interface GateRunResult {
  simFp: string;
  verifyFp: string;
  consistencyFp: string;
  manifestHash: Hash256;
  decision: 'PASS' | 'BLOCK';
  reasons: string[];
}

/** Complete job snapshot (single source of truth) */
export interface JobSnapshot {
  jobId: string;
  specState: SpecState;
  snapshotTimeISO: string;
  /** Hash of approved design snapshot */
  designFingerprint: string;
  /** Hash of toolpath plan */
  toolpathPlanFingerprint: string;
  /** Pinned machine profile */
  machinePin: MachinePin;
  /** Last Gate run results */
  lastGate: GateRunResult;
}

// ============================================================================
// Types: Audit Log
// ============================================================================

/** Audit log entry for exports */
export interface ExportAuditEntry {
  id: string;
  atISO: string;
  jobId: string;
  actor: ExportActor;
  action: 'EXPORT' | 'GATE_RUN' | 'EXPORT_BLOCKED';
  exportId?: string;
  manifestHash?: Hash256;
  gcodeHash?: Hash256;
  kind?: ExportKind;
  reasons?: string[];
  details?: Record<string, unknown>;
}

// ============================================================================
// Types: Store Interfaces (Abstract for DI)
// ============================================================================

/** Job store interface */
export interface IJobStore {
  readSnapshot(jobId: string): Promise<JobSnapshot | null>;
  writeSnapshot(snapshot: JobSnapshot): Promise<void>;
  readDesignFingerprint(jobId: string): Promise<string>;
  readToolpathPlanFingerprint(jobId: string): Promise<string>;
}

/** Artifact store interface */
export interface IArtifactStore {
  readManifest(jobId: string, manifestHash: Hash256): Promise<ManifestV1 | null>;
  writeManifest(jobId: string, manifest: ManifestV1): Promise<void>;
  readGcode(jobId: string, gcodeHash: Hash256): Promise<string | null>;
  writeGcode(jobId: string, gcode: string, hash: Hash256): Promise<void>;
  readMotionPlan(jobId: string, hash: Hash256): Promise<MotionPlanV1 | null>;
  writeMotionPlan(jobId: string, plan: MotionPlanV1, hash: Hash256): Promise<void>;
  write(path: string, content: string | Buffer): Promise<void>;
  read(path: string): Promise<string | Buffer | null>;
  exists(path: string): Promise<boolean>;
}

/** Signing service interface */
export interface ISigningService {
  getSecret(keyId: string): Promise<string>;
  verifyManifest(manifest: ManifestV1): Promise<boolean>;
}

/** Audit log interface */
export interface IAuditLog {
  append(entry: Omit<ExportAuditEntry, 'id'>): Promise<string>;
  read(entryId: string): Promise<ExportAuditEntry | null>;
  listByJob(jobId: string): Promise<ExportAuditEntry[]>;
}

/** Gate pipeline runner interface */
export interface IGatePipeline {
  run(input: GatePipelineInput): Promise<GatePipelineOutput>;
}

/** Gate pipeline input */
export interface GatePipelineInput {
  jobId: string;
  machineProfileId: string;
  machineProfileVersion: string;
  snapshotTimeISO: string;
}

/** Gate pipeline output */
export interface GatePipelineOutput {
  decision: { gateKind: 'PASS' | 'BLOCK'; reasons: string[] };
  manifest: ManifestV1;
  simReport: SimReport;
  verifyReport: ToolpathVerifyReport;
  consistencyReport: ConsistencyReport;
  gcode: string;
  motionPlan: MotionPlanV1;
}

// ============================================================================
// Block Reason Codes
// ============================================================================

export const EXPORT_BLOCK_REASON = {
  NOT_RELEASED: 'NOT_RELEASED',
  GATE_BLOCK: 'GATE_BLOCK',
  MACHINE_PROFILE_PIN_MISMATCH: 'MACHINE_PROFILE_PIN_MISMATCH',
  MANIFEST_NOT_FOUND: 'MANIFEST_NOT_FOUND',
  MANIFEST_SIGNATURE_INVALID: 'MANIFEST_SIGNATURE_INVALID',
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  GCODE_NOT_FOUND: 'GCODE_NOT_FOUND',
  GATE_REQUIRED: 'GATE_REQUIRED',
  STORE_ERROR: 'STORE_ERROR',
} as const;

// ============================================================================
// Export Gate Context (Dependency Injection)
// ============================================================================

/** Dependencies for export gate */
export interface ExportGateContext {
  jobStore: IJobStore;
  artifactStore: IArtifactStore;
  signingService: ISigningService;
  auditLog: IAuditLog;
  gatePipeline: IGatePipeline;
}

// ============================================================================
// Fresh Gate Run
// ============================================================================

/**
 * Result of ensureFreshGateRun
 */
type FreshGateResult =
  | { kind: 'OK' }
  | { kind: 'BLOCK'; reasons: string[]; report: ExportResultBlock['report'] };

/**
 * Ensure gate run is fresh (re-run if inputs changed)
 */
async function ensureFreshGateRun(
  ctx: ExportGateContext,
  snap: JobSnapshot,
  req: ExportRequest
): Promise<FreshGateResult> {
  // Load current canonical fingerprints
  const curDesignFp = await ctx.jobStore.readDesignFingerprint(snap.jobId);
  const curPlanFp = await ctx.jobStore.readToolpathPlanFingerprint(snap.jobId);

  // Check if fingerprints changed
  const needsRerun =
    curDesignFp !== snap.designFingerprint ||
    curPlanFp !== snap.toolpathPlanFingerprint;

  if (!needsRerun) {
    return { kind: 'OK' };
  }

  // Re-run full gate pipeline
  const gateOut = await ctx.gatePipeline.run({
    jobId: snap.jobId,
    machineProfileId: req.machineProfileId,
    machineProfileVersion: req.machineProfileVersion,
    snapshotTimeISO: snap.snapshotTimeISO,
  });

  // Log gate run
  await ctx.auditLog.append({
    atISO: new Date().toISOString(),
    jobId: snap.jobId,
    actor: req.actor,
    action: 'GATE_RUN',
    manifestHash: gateOut.manifest.signatures.manifestHash,
    details: {
      designFp: curDesignFp,
      planFp: curPlanFp,
      decision: gateOut.decision.gateKind,
    },
  });

  // Check if gate blocked
  if (gateOut.decision.gateKind === 'BLOCK') {
    return {
      kind: 'BLOCK',
      reasons: gateOut.decision.reasons,
      report: {
        sim: gateOut.simReport,
        verify: gateOut.verifyReport,
        consistency: gateOut.consistencyReport,
      },
    };
  }

  // Store artifacts
  await ctx.artifactStore.writeManifest(snap.jobId, gateOut.manifest);
  await ctx.artifactStore.writeGcode(
    snap.jobId,
    gateOut.gcode,
    gateOut.manifest.artifacts.gcodeHash
  );
  await ctx.artifactStore.writeMotionPlan(
    snap.jobId,
    gateOut.motionPlan,
    gateOut.manifest.artifacts.motionPlanHash
  );

  // Update snapshot
  await ctx.jobStore.writeSnapshot({
    ...snap,
    designFingerprint: curDesignFp,
    toolpathPlanFingerprint: curPlanFp,
    lastGate: {
      simFp: gateOut.simReport.fingerprint,
      verifyFp: gateOut.verifyReport.fingerprint,
      consistencyFp: gateOut.consistencyReport.fingerprint,
      manifestHash: gateOut.manifest.signatures.manifestHash,
      decision: 'PASS',
      reasons: [],
    },
  });

  return { kind: 'OK' };
}

// ============================================================================
// Main Export Function
// ============================================================================

/**
 * Export job artifacts (single entry point for all exports)
 *
 * Enforces:
 * - specState === RELEASED
 * - Gate decision === PASS
 * - Machine profile matches pin
 * - Manifest signature valid
 */
export async function exportJob(
  ctx: ExportGateContext,
  req: ExportRequest
): Promise<ExportResult> {
  // 1) Load job snapshot (single source of truth)
  const snap = await ctx.jobStore.readSnapshot(req.jobId);

  if (!snap) {
    await logBlockedExport(ctx, req, [EXPORT_BLOCK_REASON.SNAPSHOT_NOT_FOUND]);
    return {
      kind: 'BLOCK',
      reasons: [EXPORT_BLOCK_REASON.SNAPSHOT_NOT_FOUND],
      report: {},
    };
  }

  // 2) Enforce RELEASED state
  if (snap.specState !== 'RELEASED') {
    await logBlockedExport(ctx, req, [EXPORT_BLOCK_REASON.NOT_RELEASED]);
    return {
      kind: 'BLOCK',
      reasons: [EXPORT_BLOCK_REASON.NOT_RELEASED],
      report: {},
    };
  }

  // 3) Enforce machine profile pin
  if (
    snap.machinePin.machineProfileId !== req.machineProfileId ||
    snap.machinePin.machineProfileVersion !== req.machineProfileVersion
  ) {
    await logBlockedExport(ctx, req, [EXPORT_BLOCK_REASON.MACHINE_PROFILE_PIN_MISMATCH]);
    return {
      kind: 'BLOCK',
      reasons: [EXPORT_BLOCK_REASON.MACHINE_PROFILE_PIN_MISMATCH],
      report: {},
    };
  }

  // 4) Optionally require fresh verification
  if (req.requireFreshVerify) {
    const freshResult = await ensureFreshGateRun(ctx, snap, req);
    if (freshResult.kind === 'BLOCK') {
      await logBlockedExport(ctx, req, freshResult.reasons);
      return {
        kind: 'BLOCK',
        reasons: freshResult.reasons,
        report: freshResult.report,
      };
    }
  }

  // Re-read snapshot after potential gate run
  const snap2 = await ctx.jobStore.readSnapshot(req.jobId);
  if (!snap2) {
    return {
      kind: 'BLOCK',
      reasons: [EXPORT_BLOCK_REASON.STORE_ERROR],
      report: {},
    };
  }

  // 5) Require PASS decision
  if (snap2.lastGate.decision !== 'PASS') {
    await logBlockedExport(ctx, req, snap2.lastGate.reasons);
    return {
      kind: 'BLOCK',
      reasons: snap2.lastGate.reasons.length > 0
        ? snap2.lastGate.reasons
        : [EXPORT_BLOCK_REASON.GATE_BLOCK],
      report: {},
    };
  }

  // 6) Load signed manifest by hash
  const manifest = await ctx.artifactStore.readManifest(
    req.jobId,
    snap2.lastGate.manifestHash
  );

  if (!manifest) {
    await logBlockedExport(ctx, req, [EXPORT_BLOCK_REASON.MANIFEST_NOT_FOUND]);
    return {
      kind: 'BLOCK',
      reasons: [EXPORT_BLOCK_REASON.MANIFEST_NOT_FOUND],
      report: {},
    };
  }

  // 7) Verify signature server-side
  const sigValid = await ctx.signingService.verifyManifest(manifest);
  if (!sigValid) {
    await logBlockedExport(ctx, req, [EXPORT_BLOCK_REASON.MANIFEST_SIGNATURE_INVALID]);
    return {
      kind: 'BLOCK',
      reasons: [EXPORT_BLOCK_REASON.MANIFEST_SIGNATURE_INVALID],
      report: {},
    };
  }

  // 8) Build export bundle
  const exportId = generateExportId(manifest.signatures.manifestHash, req.jobId);
  const files: ExportFile[] = [];

  // Always include manifest
  const manifestJson = stableJson(manifest);
  const manifestPath = `jobs/${req.jobId}/exports/${exportId}/manifest.json`;
  await ctx.artifactStore.write(manifestPath, manifestJson);
  files.push({
    path: manifestPath,
    sha256: manifest.signatures.manifestHash,
    sizeBytes: Buffer.byteLength(manifestJson, 'utf8'),
  });

  // Include G-code if requested
  if (req.kind === 'GCODE' || req.kind === 'BUNDLE_ZIP') {
    const gcode = await ctx.artifactStore.readGcode(
      req.jobId,
      manifest.artifacts.gcodeHash
    );

    if (!gcode) {
      await logBlockedExport(ctx, req, [EXPORT_BLOCK_REASON.GCODE_NOT_FOUND]);
      return {
        kind: 'BLOCK',
        reasons: [EXPORT_BLOCK_REASON.GCODE_NOT_FOUND],
        report: {},
      };
    }

    const gcodePath = `jobs/${req.jobId}/exports/${exportId}/program.nc`;
    await ctx.artifactStore.write(gcodePath, gcode);
    files.push({
      path: gcodePath,
      sha256: manifest.artifacts.gcodeHash,
      sizeBytes: Buffer.byteLength(gcode, 'utf8'),
    });
  }

  // Bundle mode: include reports
  if (req.kind === 'BUNDLE_ZIP') {
    // Sim report
    const simReportPath = `jobs/${req.jobId}/exports/${exportId}/reports/sim.json`;
    await ctx.artifactStore.write(
      simReportPath,
      JSON.stringify({ hash: manifest.artifacts.sim.reportHash }, null, 2)
    );
    files.push({ path: simReportPath, sha256: manifest.artifacts.sim.reportHash });

    // Verify report
    const verifyReportPath = `jobs/${req.jobId}/exports/${exportId}/reports/verify.json`;
    await ctx.artifactStore.write(
      verifyReportPath,
      JSON.stringify({ hash: manifest.artifacts.verify_10_8_1.reportHash }, null, 2)
    );
    files.push({ path: verifyReportPath, sha256: manifest.artifacts.verify_10_8_1.reportHash });

    // Consistency report
    const consistencyReportPath = `jobs/${req.jobId}/exports/${exportId}/reports/consistency.json`;
    await ctx.artifactStore.write(
      consistencyReportPath,
      JSON.stringify({ hash: manifest.artifacts.consistency_10_8_2.reportHash }, null, 2)
    );
    files.push({ path: consistencyReportPath, sha256: manifest.artifacts.consistency_10_8_2.reportHash });

    // Job summary (human readable)
    const summary = generateJobSummary(manifest, snap2);
    const summaryPath = `jobs/${req.jobId}/exports/${exportId}/job-summary.txt`;
    await ctx.artifactStore.write(summaryPath, summary);
    files.push({ path: summaryPath, sha256: sha256Hex(summary) });
  }

  // 9) Write audit log entry
  const auditEntryId = await ctx.auditLog.append({
    atISO: new Date().toISOString(),
    jobId: req.jobId,
    actor: req.actor,
    action: 'EXPORT',
    exportId,
    manifestHash: manifest.signatures.manifestHash,
    gcodeHash: manifest.artifacts.gcodeHash,
    kind: req.kind,
  });

  return {
    kind: 'OK',
    exportId,
    manifest,
    files,
    auditEntryId,
  };
}

/**
 * Log blocked export attempt
 */
async function logBlockedExport(
  ctx: ExportGateContext,
  req: ExportRequest,
  reasons: string[]
): Promise<void> {
  await ctx.auditLog.append({
    atISO: new Date().toISOString(),
    jobId: req.jobId,
    actor: req.actor,
    action: 'EXPORT_BLOCKED',
    kind: req.kind,
    reasons,
  });
}

/**
 * Generate human-readable job summary
 */
function generateJobSummary(manifest: ManifestV1, snap: JobSnapshot): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '  MONOLITH Export Summary',
    '═══════════════════════════════════════════════════════════════',
    '',
    `Job ID:          ${manifest.job.jobId}`,
    `Spec State:      ${manifest.job.specState}`,
    `Created:         ${manifest.createdAtISO}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '  Machine Configuration',
    '───────────────────────────────────────────────────────────────',
    '',
    `Profile:         ${manifest.machine.machineProfileId}`,
    `Version:         ${manifest.machine.machineProfileVersion}`,
    `Dialect:         ${manifest.machine.dialect}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '  Verification Status',
    '───────────────────────────────────────────────────────────────',
    '',
    `Simulation:      ${manifest.artifacts.sim.kind}`,
    `Toolpath Check:  ${manifest.artifacts.verify_10_8_1.kind}`,
    `Consistency:     ${manifest.artifacts.consistency_10_8_2.kind}`,
    `Gate Decision:   ${manifest.decision.gateKind}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '  Traceability',
    '───────────────────────────────────────────────────────────────',
    '',
    `Design FP:       ${manifest.job.designFingerprint.slice(0, 32)}...`,
    `Motion Plan:     ${manifest.artifacts.motionPlanHash.slice(0, 32)}...`,
    `G-code Hash:     ${manifest.artifacts.gcodeHash.slice(0, 32)}...`,
    `Manifest Hash:   ${manifest.signatures.manifestHash.slice(0, 32)}...`,
    '',
    '───────────────────────────────────────────────────────────────',
    '  Steps',
    '───────────────────────────────────────────────────────────────',
    '',
  ];

  for (const pin of manifest.planning.stepPins) {
    lines.push(`  ${pin.stepId}: ${pin.opKind} ${pin.passKind} (tool: ${pin.toolId})`);
  }

  lines.push('');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('  Signed by MONOLITH Gate System');
  lines.push(`  Key ID: ${manifest.signatures.keyId}`);
  lines.push(`  Method: ${manifest.signatures.method}`);
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if export request is valid
 */
export function validateExportRequest(req: ExportRequest): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!req.jobId || req.jobId.trim().length === 0) {
    errors.push('jobId is required');
  }

  if (!['GCODE', 'DXF', 'CSV_CUTLIST', 'BUNDLE_ZIP'].includes(req.kind)) {
    errors.push(`Invalid export kind: ${req.kind}`);
  }

  if (!req.machineProfileId || req.machineProfileId.trim().length === 0) {
    errors.push('machineProfileId is required');
  }

  if (!req.machineProfileVersion || req.machineProfileVersion.trim().length === 0) {
    errors.push('machineProfileVersion is required');
  }

  if (!req.actor || !req.actor.type || !req.actor.id) {
    errors.push('actor with type and id is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create export request with defaults
 */
export function createExportRequest(
  jobId: string,
  kind: ExportKind,
  machineProfileId: string,
  machineProfileVersion: string,
  actor: ExportActor,
  options?: { requireFreshVerify?: boolean }
): ExportRequest {
  return {
    jobId,
    kind,
    machineProfileId,
    machineProfileVersion,
    requireFreshVerify: options?.requireFreshVerify ?? true,
    actor,
  };
}

/**
 * Create job snapshot
 */
export function createJobSnapshot(
  jobId: string,
  specState: SpecState,
  snapshotTimeISO: string,
  designFingerprint: string,
  toolpathPlanFingerprint: string,
  machinePin: MachinePin,
  lastGate: GateRunResult
): JobSnapshot {
  return {
    jobId,
    specState,
    snapshotTimeISO,
    designFingerprint,
    toolpathPlanFingerprint,
    machinePin,
    lastGate,
  };
}

/**
 * Check if snapshot allows export (quick check without full export)
 */
export function canExportSnapshot(snap: JobSnapshot): {
  canExport: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  if (snap.specState !== 'RELEASED') {
    reasons.push(EXPORT_BLOCK_REASON.NOT_RELEASED);
  }

  if (snap.lastGate.decision !== 'PASS') {
    reasons.push(EXPORT_BLOCK_REASON.GATE_BLOCK);
    reasons.push(...snap.lastGate.reasons);
  }

  return {
    canExport: reasons.length === 0,
    reasons,
  };
}

/**
 * Get export file path for artifact
 */
export function getExportFilePath(
  jobId: string,
  exportId: string,
  filename: string
): string {
  return `jobs/${jobId}/exports/${exportId}/${filename}`;
}

/**
 * Parse export ID from path
 */
export function parseExportPath(path: string): {
  jobId: string;
  exportId: string;
  filename: string;
} | null {
  const match = path.match(/^jobs\/([^/]+)\/exports\/([^/]+)\/(.+)$/);
  if (!match) return null;

  return {
    jobId: match[1],
    exportId: match[2],
    filename: match[3],
  };
}

/**
 * Summarize export result for logging
 */
export function summarizeExportResult(result: ExportResult): string {
  if (result.kind === 'OK') {
    return [
      `Export: OK`,
      `  Export ID: ${result.exportId}`,
      `  Manifest Hash: ${result.manifest.signatures.manifestHash.slice(0, 16)}...`,
      `  Files: ${result.files.length}`,
      ...result.files.map(f => `    - ${f.path}`),
      `  Audit Entry: ${result.auditEntryId}`,
    ].join('\n');
  } else {
    return [
      `Export: BLOCKED`,
      `  Reasons: ${result.reasons.join(', ')}`,
    ].join('\n');
  }
}

/**
 * Check if export result is successful
 */
export function isExportSuccessful(result: ExportResult): result is ExportResultOK {
  return result.kind === 'OK';
}

/**
 * Extract files from successful export
 */
export function getExportFiles(result: ExportResult): ExportFile[] {
  return result.kind === 'OK' ? result.files : [];
}

/**
 * Get total export size in bytes
 */
export function getExportSize(result: ExportResult): number {
  if (result.kind !== 'OK') return 0;
  return result.files.reduce((sum, f) => sum + (f.sizeBytes ?? 0), 0);
}
