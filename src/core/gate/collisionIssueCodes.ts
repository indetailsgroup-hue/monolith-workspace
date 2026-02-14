/**
 * collisionIssueCodes.ts - Gate Issue Codes for Collision
 *
 * ARCHITECTURE:
 * - Defines standardized issue codes for collision-related gate issues
 * - Allows consistent handling and localization of collision errors
 * - Integrates with existing GateIssue type
 */

// ============================================
// ISSUE CODES
// ============================================

export const COLLISION_ISSUE = {
  /** Two objects overlap (penetration > 0) */
  OVERLAP: 'COLLISION_OVERLAP',
  /** Gap between objects is less than minimum */
  MIN_GAP: 'COLLISION_MIN_GAP',
  /** External collision (with non-selected object) */
  EXTERNAL: 'COLLISION_EXTERNAL',
  /** Internal collision (within selection) */
  INTERNAL: 'COLLISION_INTERNAL',
  /** Collision with world obstacle (wall, etc.) */
  OBSTACLE: 'COLLISION_OBSTACLE',
} as const;

export type CollisionIssueCode = typeof COLLISION_ISSUE[keyof typeof COLLISION_ISSUE];

// ============================================
// ISSUE SEVERITY
// ============================================

export type IssueSeverity = 'ERROR' | 'WARNING';

/**
 * Default severity for each collision issue code
 */
export const COLLISION_ISSUE_SEVERITY: Record<CollisionIssueCode, IssueSeverity> = {
  [COLLISION_ISSUE.OVERLAP]: 'ERROR',
  [COLLISION_ISSUE.MIN_GAP]: 'ERROR',
  [COLLISION_ISSUE.EXTERNAL]: 'ERROR',
  [COLLISION_ISSUE.INTERNAL]: 'ERROR',
  [COLLISION_ISSUE.OBSTACLE]: 'ERROR',
};

// ============================================
// EXTENDED GATE ISSUE TYPE
// ============================================

/**
 * Gate issue with collision-specific fields
 */
export interface CollisionGateIssue {
  /** Issue severity */
  severity: IssueSeverity;
  /** Issue code */
  code: CollisionIssueCode;
  /** Human-readable message */
  message: string;

  // Traceability fields
  /** ID of the subject cabinet */
  subjectId?: string;
  /** ID of the related cabinet (for pair collisions) */
  relatedId?: string;
  /** Additional metrics */
  metrics?: Record<string, number | string | boolean>;
}

// ============================================
// MESSAGE TEMPLATES
// ============================================

/**
 * Generate message for collision overlap
 */
export function formatOverlapMessage(args: {
  aId: string;
  bId: string;
  penetrationMm: number;
}): string {
  return `Collision overlap detected: ${args.aId} and ${args.bId} overlap by ${args.penetrationMm.toFixed(2)}mm`;
}

/**
 * Generate message for min gap violation
 */
export function formatMinGapMessage(args: {
  aId: string;
  bId: string;
  gapMm: number;
  requiredMm: number;
}): string {
  return `Minimum gap violation: ${args.aId} and ${args.bId} are ${args.gapMm.toFixed(2)}mm apart (required: ${args.requiredMm}mm)`;
}

/**
 * Generate message for external collision
 */
export function formatExternalCollisionMessage(args: {
  cabId: string;
  obstacleId: string;
  obstacleKind?: string;
}): string {
  const kind = args.obstacleKind ? ` (${args.obstacleKind})` : '';
  return `External collision: ${args.cabId} collides with ${args.obstacleId}${kind}`;
}

/**
 * Generate message for internal collision
 */
export function formatInternalCollisionMessage(args: {
  aId: string;
  bId: string;
}): string {
  return `Internal collision: ${args.aId} and ${args.bId} overlap within selection`;
}
