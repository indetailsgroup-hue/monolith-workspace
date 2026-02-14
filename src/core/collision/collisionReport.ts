/**
 * collisionReport.ts - Collision Detection Report Types
 *
 * Defines the collision report structure used by the trust chain
 * to verify that cabinet placement has no blocking collisions.
 *
 * @version 1.0.0
 */

/** A single collision pair between two cabinets */
export interface CollisionPair {
  /** First cabinet ID */
  idA: string;
  /** Second cabinet ID */
  idB: string;
  /** Penetration depth in mm (positive = overlapping) */
  penetrationMm?: number;
  /** Gap distance in mm (positive = separated) */
  gapMm?: number;
}

/**
 * Collision detection report
 *
 * Generated after cabinet placement to determine if positions are valid.
 * A blocked report prevents commit to manifest chain.
 */
export interface CollisionReport {
  /** Whether placement is blocked by collisions */
  blocked: boolean;
  /** All detected collision pairs */
  pairs: CollisionPair[];
  /** Worst penetration across all pairs (mm) */
  worstPenetrationMm?: number;
  /** Worst gap across all pairs (mm) */
  worstGapMm?: number;
}
