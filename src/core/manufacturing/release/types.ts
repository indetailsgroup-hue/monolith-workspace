/**
 * Release Types - Approval + Bundle
 *
 * Step 6 of Plasticity-Style Modeling Layer:
 * - Approval signatures (explicit, auditable)
 * - Release bundle (snapshot + opgraph + manifest)
 *
 * v1.0: Initial release types
 */

import type { FrozenSnapshot } from '../gate/snapshot';
import type { OperationGraph } from '../opgraph/types';

// ============================================================================
// Approval Types
// ============================================================================

export type ApprovalRole = 'DESIGNER' | 'ENGINEERING' | 'OPS' | 'ADMIN';

/**
 * Approval signature from a user.
 * Required before transitioning from FROZEN → RELEASED.
 */
export interface ApprovalSignature {
  /** Approver identifier (email, user ID) */
  approverId: string;
  /** Role of the approver */
  role: ApprovalRole;
  /** ISO timestamp when approved */
  signedAtIso: string;
  /** Human-readable approval message */
  message: string;
  /** Cryptographic signature (mock or real) */
  signature: string;
  /** Key ID used for signing */
  keyId: string;
}

/**
 * Approval requirement (policy-driven in future).
 */
export interface ApprovalRequirement {
  /** Minimum number of approvals needed */
  minApprovals: number;
  /** Required roles (any match) */
  requiredRoles?: ApprovalRole[];
  /** Require specific approver IDs */
  requiredApprovers?: string[];
}

export const DEFAULT_APPROVAL_REQUIREMENT: ApprovalRequirement = {
  minApprovals: 1,
};

// ============================================================================
// Release File Types
// ============================================================================

/**
 * File in the release bundle.
 */
export interface ReleaseFile {
  /** File path in bundle */
  path: string;
  /** File size in bytes */
  bytes: number;
  /** Content hash (FNV-1a for MVP) */
  hash: string;
  /** File content (string for MVP) */
  content: string;
  /** MIME type */
  mime: string;
}

// ============================================================================
// Release Bundle Types
// ============================================================================

/**
 * Complete release bundle for factory.
 * Contains all artifacts needed for manufacturing.
 */
export interface ReleaseBundle {
  /** Bundle version */
  version: 'release-bundle.v1';
  /** Optional factory ID */
  factoryId?: string;
  /** Creation timestamp */
  createdAtIso: string;
  /** Bundle ID */
  bundleId: string;
  /** Embedded frozen snapshot */
  snapshot: FrozenSnapshot;
  /** Embedded operation graph */
  opGraph: OperationGraph;
  /** All bundle files */
  files: ReleaseFile[];
  /** Approval signatures */
  approvals: ApprovalSignature[];
}

/**
 * Minimal bundle metadata (for UI display).
 */
export interface ReleaseBundleMeta {
  bundleId: string;
  snapshotId: string;
  createdAtIso: string;
  approvalCount: number;
  fileCount: number;
  totalBytes: number;
}

/**
 * Get bundle metadata for display.
 */
export function getBundleMeta(bundle: ReleaseBundle): ReleaseBundleMeta {
  return {
    bundleId: bundle.bundleId,
    snapshotId: bundle.snapshot.snapshotId,
    createdAtIso: bundle.createdAtIso,
    approvalCount: bundle.approvals.length,
    fileCount: bundle.files.length,
    totalBytes: bundle.files.reduce((sum, f) => sum + f.bytes, 0),
  };
}
