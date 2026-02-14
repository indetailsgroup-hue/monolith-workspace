/**
 * MONOLITH SpecState UX Types
 *
 * Factory Workflow: Freeze = Snapshot, Gate = Explicit Step, Release = Signed Package
 *
 * This module defines the core types for the specification state machine:
 * - SpecState: DRAFT | FROZEN | RELEASED
 * - Document union: DraftDoc | FrozenDoc | ReleasedDoc
 * - Snapshot, Gate, and Release contracts
 */

import type { PartBreakdownRow } from '../gate/builders/fromBreakdown';
import type { DrillOp, FittingIntent } from '../gate/types';

// ============================================
// CORE STATE TYPES
// ============================================

export type SpecState = 'DRAFT' | 'FROZEN' | 'RELEASED';

export type Severity = 'BLOCKER' | 'WARNING' | 'INFO';

// ============================================
// DRAFT TYPES
// ============================================

/**
 * Editable designer spec (parametric cabinet model, materials, fittings intent)
 * This is high-level; your actual type will be richer
 */
export type DraftSpec = {
  version: number;
  name: string;
  updatedAt: string;
};

/**
 * Summary of draft state for UI display
 */
export type DraftSummary = {
  partsCount: number;
  fittingsCount: number;
  materialsCount: number;
  warnings: Array<{ code: string; message: string }>;
};

// ============================================
// FROZEN SNAPSHOT TYPES
// ============================================

/**
 * Immutable manufacturing payload captured at Freeze time
 * Contains all data needed for Gate validation
 */
export type SnapshotPayload = {
  /** Part breakdown rows from Cut List modal */
  breakdownRows: PartBreakdownRow[];

  /** Drill operations (resolved from fitting intents) */
  drillOps?: DrillOp[];

  /** Fitting placement intents */
  fittings?: FittingIntent[];

  /** Cabinet-level context */
  cabinet?: {
    backPanelThicknessMm?: number;
  };
};

/**
 * Immutable snapshot created when spec is frozen
 * Contains canonicalized manufacturing truth
 */
export type FrozenSnapshot = {
  snapshotId: string;
  sourceRevisionId: string;
  createdAt: string;
  createdBy: string;

  /** Canonical hash of manufacturing truth */
  canonicalHash?: string;

  /** Summary for UI display */
  summary: DraftSummary;

  /**
   * Immutable manufacturing payload (v0.1)
   * Contains breakdown rows, drill ops, fittings for Gate validation
   * Gate reads ONLY from this payload, not from DRAFT state
   */
  payload?: SnapshotPayload;
};

// ============================================
// GATE TYPES
// ============================================

/**
 * Single issue from gate validation
 */
export type GateIssue = {
  id: string;
  severity: Severity;
  code: string;
  message: string;

  /** Affected part IDs */
  partIds?: string[];

  /** Numeric context for thresholds */
  context?: Record<string, string | number | boolean | null>;
};

/**
 * Full gate validation report
 */
export type GateReport = {
  gateReportId: string;
  snapshotId: string;
  runAt: string;
  runBy: string;
  policyVersion: string;
  machineProfileId?: string;

  blockers: GateIssue[];
  warnings: GateIssue[];
  info: GateIssue[];

  /** Optional metrics (cost, time, yield, etc.) */
  metrics?: Record<string, number>;
};

// ============================================
// RELEASE TYPES
// ============================================

/**
 * Signed manifest of all factory artifacts
 */
export type SignedManifest = {
  manifestId: string;
  snapshotId: string;
  gateReportId: string;
  createdAt: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
};

/**
 * Approval signature from authorized user
 */
export type ApprovalSignature = {
  signerUserId: string;
  signedAt: string;
  /** Optional: signature blob, cert chain, etc. */
  signature?: string;
};

/**
 * Complete release package with manifest and signatures
 */
export type ReleasePackage = {
  releaseId: string;
  snapshotId: string;
  gateReportId: string;
  releasedAt: string;
  releasedBy: string;

  manifest: SignedManifest;
  signatures: ApprovalSignature[];

  /**
   * v0.1: Full signed manifest with SHA-256 hashes
   * (imported from release/manifest module)
   */
  signedManifest?: import('../release').SignedManifest;

  /**
   * v0.1: Artifact contents for download (DEPRECATED - use artifactBundleId)
   * Map of path → content (UTF-8 string)
   */
  artifactContents?: Map<string, string>;

  /**
   * v0.1: Reference to immutable artifact bundle in ArtifactStore
   * Artifacts are stored ONCE at release, downloaded from store (never regenerated)
   */
  artifactBundleId?: string;
};

// ============================================
// DISCRIMINATED DOCUMENT UNION
// ============================================

/**
 * Document in DRAFT state - editable
 */
export type DraftDoc = {
  state: 'DRAFT';
  projectId: string;
  revisionId: string;
  spec: DraftSpec;
  summary: DraftSummary;
};

/**
 * Document in FROZEN state - locked for review
 */
export type FrozenDoc = {
  state: 'FROZEN';
  projectId: string;
  snapshot: FrozenSnapshot;
  lastGate?: GateReport;
};

/**
 * Document in RELEASED state - factory committed
 */
export type ReleasedDoc = {
  state: 'RELEASED';
  projectId: string;
  snapshot: FrozenSnapshot;
  gate: GateReport;
  release: ReleasePackage;
};

/**
 * Discriminated union for hard enforcement in UI + runtime
 */
export type SpecDoc = DraftDoc | FrozenDoc | ReleasedDoc;

// ============================================
// MACHINE PROFILE
// ============================================

export type MachineProfile = {
  id: string;
  label: string;
};
