/**
 * commitApprovedState.ts - Commit Approved State to Manifest Chain
 *
 * NORTH STAR: Every geometry commit is cryptographically signed
 *
 * FLOW (on mouse up after drag):
 * 1. Collision must pass
 * 2. Gate bundle must pass
 * 3. Build TrustReport
 * 4. Sign TrustReport (Approval key)
 * 5. Build SignedManifest (prev=HEAD)
 * 6. Sign Manifest (Manifest key)
 * 7. Save manifest + set HEAD
 * 8. Commit geometry to store
 *
 * INVARIANT: Manifest saved BEFORE geometry committed
 */

import type { ManifestStore } from '../manifest/manifestStoreTypes';
import type { CollisionReport } from '../collision/collisionReport';
import type { CabinetInstanceMinimal } from '../collision/collisionAdapter';
import type { GateBundleResult, GateIssue } from '../gate/gateBundleTypes';
import type { SignedJobManifest } from '../trust/manifestChainTypes';
import type { TrustReport } from '../trust/trustReportTypes';
import type { RunGatePerCabinetFn } from '../gate/runGateBundle';
import type { SpecStatus } from '../spec/specState';

import { runGateBundle } from '../gate/runGateBundle';
import { buildTrustReport } from '../trust/buildTrustReport';
import { signTrustReport } from '../trust/signTrustReport';
import { buildSignedManifest } from '../trust/buildManifest';

// ============================================
// TYPES
// ============================================

/**
 * Cabinet instance for gate checking (alias for CabinetInstanceMinimal)
 */
export type CabinetForGate = CabinetInstanceMinimal;

/**
 * Commit configuration
 */
export interface CommitConfig {
  /** Job identifier */
  jobId: string;

  /** Cabinets after drag (preview state) */
  selectionPreview: CabinetForGate[];

  /** IDs of selected cabinets */
  selectionIds: string[];

  /** Currently active cabinet ID */
  activeId: string | null;

  /** Collision report from drag */
  collision: CollisionReport | null;

  /** Spec status (DRAFT/FROZEN/RELEASED) - signed in trust report */
  spec?: SpecStatus;

  /** Minimum gap setting (mm) */
  minGapMm: number;

  /** Gate runner for each cabinet */
  runGatePerCabinet: RunGatePerCabinetFn;

  /** Function to commit geometry to state */
  commitAll: (cabs: CabinetForGate[]) => void;

  /** Manifest store */
  store: ManifestStore;

  /** Approval key ID (for trust signing) */
  approvalKeyId: string;

  /** Approval private key */
  approvalPrivateKeyHex: string;

  /** Manifest key ID */
  manifestKeyId: string;

  /** Manifest private key */
  manifestPrivateKeyHex: string;

  /** Allow genesis manifest (first commit) */
  allowGenesis?: boolean;

  /** Creator identifier */
  createdBy?: string;
}

/**
 * Commit result
 */
export type CommitResult =
  | { ok: true; headHash: string; gateResult: GateBundleResult }
  | { ok: false; reason: string; gateResult?: GateBundleResult };

// ============================================
// COMMIT FUNCTION
// ============================================

/**
 * Commit approved state to manifest chain
 *
 * GUARANTEES:
 * - Collision and gate validation passed
 * - Trust report signed with approval key
 * - Manifest signed with manifest key
 * - Manifest saved before geometry committed
 */
export async function commitApprovedState(
  config: CommitConfig
): Promise<CommitResult> {
  const {
    jobId,
    selectionPreview,
    selectionIds,
    activeId,
    collision,
    spec,
    minGapMm,
    runGatePerCabinet,
    commitAll,
    store,
    approvalKeyId,
    approvalPrivateKeyHex,
    manifestKeyId,
    manifestPrivateKeyHex,
    allowGenesis = false,
    createdBy,
  } = config;

  // 1. Collision hard block
  if (collision?.blocked) {
    return {
      ok: false,
      reason: `Collision blocked: ${collision.pairs.length} collision pairs`,
    };
  }

  // 2. Run gate bundle
  const gateResult = runGateBundle({
    selection: selectionPreview,
    collisionReport: collision,
    minGapMm,
    runGatePerCabinet,
  });

  if (!gateResult.ok) {
    return {
      ok: false,
      reason: `Gate failed: ${gateResult.errorCount} errors`,
      gateResult,
    };
  }

  // 3. Build trust report (includes spec status for factory trust)
  const trustReport: TrustReport = buildTrustReport({
    jobId,
    selectionIds,
    activeId,
    spec: spec ?? { state: 'DRAFT' },
    gate: gateResult,
    collision,
  });

  // 4. Sign trust report
  const signedTrust = await signTrustReport({
    trust: trustReport,
    keyId: approvalKeyId,
    privateKeyHex: approvalPrivateKeyHex,
  });

  // 5. Get previous HEAD
  const prevHash = await store.getHead(jobId);

  if (!prevHash && !allowGenesis) {
    return {
      ok: false,
      reason: 'No HEAD manifest (genesis not allowed)',
      gateResult,
    };
  }

  // 6. Build signed manifest
  const manifest: SignedJobManifest = await buildSignedManifest({
    jobId,
    prevManifestHashHex: prevHash,
    signedTrust,
    exports: [], // No exports on state commit
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
  });

  // 7. Save manifest + set HEAD
  await store.put(manifest);
  await store.setHead(jobId, manifest.manifestHashHex);

  // 8. Commit geometry
  commitAll(selectionPreview);

  return {
    ok: true,
    headHash: manifest.manifestHashHex,
    gateResult,
  };
}

// ============================================
// GENESIS MANIFEST
// ============================================

/**
 * Create genesis manifest for new job
 *
 * Used when starting a new project.
 */
export async function createGenesisManifest(args: {
  jobId: string;
  store: ManifestStore;
  approvalKeyId: string;
  approvalPrivateKeyHex: string;
  manifestKeyId: string;
  manifestPrivateKeyHex: string;
  createdBy?: string;
}): Promise<{ ok: true; headHash: string } | { ok: false; reason: string }> {
  const {
    jobId,
    store,
    approvalKeyId,
    approvalPrivateKeyHex,
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
  } = args;

  // Check if HEAD already exists
  const existing = await store.getHead(jobId);
  if (existing) {
    return { ok: false, reason: 'Job already has HEAD manifest' };
  }

  // Create minimal trust report for genesis (starts in DRAFT state)
  const trustReport: TrustReport = {
    version: '1.0',
    jobId,
    timestampIso: new Date().toISOString(),
    selectionIds: [],
    activeId: null,
    spec: { state: 'DRAFT' },
    gate: {
      ok: true,
      errorCount: 0,
      warningCount: 0,
      perCabinet: [],
      globalIssues: [],
      totalIssues: 0,
    },
    collision: {
      blocked: false,
      pairCount: 0,
      worstPenetrationMm: 0,
      worstGapMm: 0,
    },
    inputsHash: 'genesis',
  };

  // Sign trust
  const signedTrust = await signTrustReport({
    trust: trustReport,
    keyId: approvalKeyId,
    privateKeyHex: approvalPrivateKeyHex,
  });

  // Build genesis manifest
  const manifest = await buildSignedManifest({
    jobId,
    prevManifestHashHex: null, // Genesis has no parent
    signedTrust,
    exports: [],
    manifestKeyId,
    manifestPrivateKeyHex,
    createdBy,
  });

  // Save + set HEAD
  await store.put(manifest);
  await store.setHead(jobId, manifest.manifestHashHex);

  return { ok: true, headHash: manifest.manifestHashHex };
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Check if commit is allowed (dry run)
 */
export function canCommit(args: {
  collision: CollisionReport | null;
  gateResult: GateBundleResult;
}): { ok: true } | { ok: false; reason: string } {
  if (args.collision?.blocked) {
    return { ok: false, reason: 'Collision blocked' };
  }

  if (!args.gateResult.ok) {
    return { ok: false, reason: 'Gate validation failed' };
  }

  return { ok: true };
}
