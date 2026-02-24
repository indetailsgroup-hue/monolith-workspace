/**
 * overlapScoring.ts - Face Overlap Scoring for Snap Candidates
 *
 * ARCHITECTURE:
 * - Calculates face overlap area between two cabinets
 * - Used for smarter snap candidate selection
 * - Prefers snaps with more contact area
 *
 * ALGORITHM:
 * - Project cabinet faces onto shared plane
 * - Calculate 2D rectangle overlap
 * - Normalize to 0-1 score
 */

import type { Vec3 } from '../types/SnapTypes';
import type { AABB } from '../collision/obbTypes';

// ============================================
// TYPES
// ============================================

export interface FaceRect {
  /** Face center position */
  center: Vec3;

  /** Face normal direction */
  normal: Vec3;

  /** Face width (perpendicular to normal, in local X) */
  width: number;

  /** Face height (perpendicular to normal, in local Y) */
  height: number;
}

export interface OverlapResult {
  /** Overlap area in mm² */
  overlapArea: number;

  /** Overlap ratio (0-1) relative to smaller face */
  overlapRatio: number;

  /** Width overlap in mm */
  widthOverlap: number;

  /** Height overlap in mm */
  heightOverlap: number;
}

export interface SnapCandidate {
  /** Target cabinet ID */
  targetId: string;

  /** Snap face (which face of moving cabinet) */
  snapFace: 'front' | 'back' | 'left' | 'right';

  /** Target face (which face of target cabinet) */
  targetFace: 'front' | 'back' | 'left' | 'right';

  /** Resulting position after snap */
  resultPosition: Vec3;

  /** Distance to snap (lower is better) */
  distance: number;
}

export interface ScoredCandidate extends SnapCandidate {
  /** Face overlap score (0-1) */
  overlapScore: number;

  /** Combined score (distance + overlap weighted) */
  combinedScore: number;
}

// ============================================
// FACE RECTANGLE FROM AABB
// ============================================

/**
 * Get face rectangle from AABB
 *
 * @param aabb - Axis-aligned bounding box
 * @param face - Which face to get
 */
export function getFaceRectFromAABB(
  aabb: AABB,
  face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
): FaceRect {
  const width = aabb.max.x - aabb.min.x;
  const height = aabb.max.y - aabb.min.y;
  const depth = aabb.max.z - aabb.min.z;

  const centerX = (aabb.min.x + aabb.max.x) / 2;
  const centerY = (aabb.min.y + aabb.max.y) / 2;
  const centerZ = (aabb.min.z + aabb.max.z) / 2;

  switch (face) {
    case 'front': // +Z face
      return {
        center: { x: centerX, y: centerY, z: aabb.max.z },
        normal: { x: 0, y: 0, z: 1 },
        width,
        height,
      };

    case 'back': // -Z face
      return {
        center: { x: centerX, y: centerY, z: aabb.min.z },
        normal: { x: 0, y: 0, z: -1 },
        width,
        height,
      };

    case 'left': // -X face
      return {
        center: { x: aabb.min.x, y: centerY, z: centerZ },
        normal: { x: -1, y: 0, z: 0 },
        width: depth,
        height,
      };

    case 'right': // +X face
      return {
        center: { x: aabb.max.x, y: centerY, z: centerZ },
        normal: { x: 1, y: 0, z: 0 },
        width: depth,
        height,
      };

    case 'top': // +Y face
      return {
        center: { x: centerX, y: aabb.max.y, z: centerZ },
        normal: { x: 0, y: 1, z: 0 },
        width,
        height: depth,
      };

    case 'bottom': // -Y face
      return {
        center: { x: centerX, y: aabb.min.y, z: centerZ },
        normal: { x: 0, y: -1, z: 0 },
        width,
        height: depth,
      };
  }
}

// ============================================
// 1D OVERLAP CALCULATION
// ============================================

/**
 * Calculate 1D overlap between two ranges
 */
function range1DOverlap(
  aMin: number,
  aMax: number,
  bMin: number,
  bMax: number
): number {
  const overlapMin = Math.max(aMin, bMin);
  const overlapMax = Math.min(aMax, bMax);

  if (overlapMax <= overlapMin) return 0;
  return overlapMax - overlapMin;
}

// ============================================
// 2D FACE OVERLAP CALCULATION
// ============================================

/**
 * Calculate 2D overlap between two coplanar face rectangles
 *
 * Assumes faces are on parallel planes (same normal direction)
 */
export function calculateFaceOverlap(
  faceA: FaceRect,
  faceB: FaceRect
): OverlapResult {
  // Check if faces are parallel (same or opposite normal)
  const dotProduct =
    faceA.normal.x * faceB.normal.x +
    faceA.normal.y * faceB.normal.y +
    faceA.normal.z * faceB.normal.z;

  // Faces must be parallel (dot product ≈ ±1)
  if (Math.abs(Math.abs(dotProduct) - 1) > 0.01) {
    return { overlapArea: 0, overlapRatio: 0, widthOverlap: 0, heightOverlap: 0 };
  }

  // Determine which axes are the face plane axes
  // based on face normal direction
  let widthOverlap: number;
  let heightOverlap: number;

  if (Math.abs(faceA.normal.z) > 0.9) {
    // Front/Back faces (XY plane)
    widthOverlap = range1DOverlap(
      faceA.center.x - faceA.width / 2,
      faceA.center.x + faceA.width / 2,
      faceB.center.x - faceB.width / 2,
      faceB.center.x + faceB.width / 2
    );
    heightOverlap = range1DOverlap(
      faceA.center.y - faceA.height / 2,
      faceA.center.y + faceA.height / 2,
      faceB.center.y - faceB.height / 2,
      faceB.center.y + faceB.height / 2
    );
  } else if (Math.abs(faceA.normal.x) > 0.9) {
    // Left/Right faces (ZY plane)
    widthOverlap = range1DOverlap(
      faceA.center.z - faceA.width / 2,
      faceA.center.z + faceA.width / 2,
      faceB.center.z - faceB.width / 2,
      faceB.center.z + faceB.width / 2
    );
    heightOverlap = range1DOverlap(
      faceA.center.y - faceA.height / 2,
      faceA.center.y + faceA.height / 2,
      faceB.center.y - faceB.height / 2,
      faceB.center.y + faceB.height / 2
    );
  } else {
    // Top/Bottom faces (XZ plane)
    widthOverlap = range1DOverlap(
      faceA.center.x - faceA.width / 2,
      faceA.center.x + faceA.width / 2,
      faceB.center.x - faceB.width / 2,
      faceB.center.x + faceB.width / 2
    );
    heightOverlap = range1DOverlap(
      faceA.center.z - faceA.height / 2,
      faceA.center.z + faceA.height / 2,
      faceB.center.z - faceB.height / 2,
      faceB.center.z + faceB.height / 2
    );
  }

  const overlapArea = widthOverlap * heightOverlap;

  // Calculate overlap ratio relative to smaller face
  const areaA = faceA.width * faceA.height;
  const areaB = faceB.width * faceB.height;
  const smallerArea = Math.min(areaA, areaB);

  const overlapRatio = smallerArea > 0 ? overlapArea / smallerArea : 0;

  return {
    overlapArea,
    overlapRatio: Math.min(1, overlapRatio), // Clamp to 1
    widthOverlap,
    heightOverlap,
  };
}

// ============================================
// AABB FACE OVERLAP
// ============================================

/**
 * Calculate overlap between two AABBs on a specific face pair
 *
 * @param aabbA - First AABB
 * @param aabbB - Second AABB
 * @param faceA - Face of first AABB
 * @param faceB - Face of second AABB (should be opposite of faceA)
 */
export function calculateAABBFaceOverlap(
  aabbA: AABB,
  aabbB: AABB,
  faceA: 'front' | 'back' | 'left' | 'right',
  faceB: 'front' | 'back' | 'left' | 'right'
): OverlapResult {
  const rectA = getFaceRectFromAABB(aabbA, faceA);
  const rectB = getFaceRectFromAABB(aabbB, faceB);

  return calculateFaceOverlap(rectA, rectB);
}

// ============================================
// SNAP CANDIDATE SCORING
// ============================================

/**
 * Score snap candidates with overlap
 *
 * @param candidates - Array of snap candidates
 * @param movingAabb - AABB of cabinet being moved
 * @param targetAabbs - Map of target cabinet AABBs
 * @param distanceWeight - Weight for distance in combined score (default 0.7)
 * @param overlapWeight - Weight for overlap in combined score (default 0.3)
 */
export function scoreSnapCandidates(
  candidates: SnapCandidate[],
  movingAabb: AABB,
  targetAabbs: Map<string, AABB>,
  distanceWeight: number = 0.7,
  overlapWeight: number = 0.3
): ScoredCandidate[] {
  // Find max distance for normalization
  const maxDistance = Math.max(...candidates.map(c => c.distance), 1);

  return candidates.map(candidate => {
    const targetAabb = targetAabbs.get(candidate.targetId);

    let overlapScore = 0;

    if (targetAabb) {
      // Calculate overlap on the snapping faces
      const overlapResult = calculateAABBFaceOverlap(
        movingAabb,
        targetAabb,
        candidate.snapFace,
        candidate.targetFace
      );

      overlapScore = overlapResult.overlapRatio;
    }

    // Normalize distance (lower distance = higher score)
    const normalizedDistance = 1 - candidate.distance / maxDistance;

    // Combined score (higher is better)
    const combinedScore =
      distanceWeight * normalizedDistance + overlapWeight * overlapScore;

    return {
      ...candidate,
      overlapScore,
      combinedScore,
    };
  });
}

/**
 * Select best snap candidate based on combined score
 */
export function selectBestCandidate(
  scoredCandidates: ScoredCandidate[]
): ScoredCandidate | null {
  if (scoredCandidates.length === 0) return null;

  return scoredCandidates.reduce((best, current) =>
    current.combinedScore > best.combinedScore ? current : best
  );
}

// ============================================
// HEIGHT ALIGNMENT SCORING
// ============================================

/**
 * Calculate height alignment score between two cabinets
 *
 * @param aabbA - First AABB
 * @param aabbB - Second AABB
 * @returns Score from 0-1 (1 = perfectly aligned)
 */
export function calculateHeightAlignmentScore(aabbA: AABB, aabbB: AABB): number {
  const heightA = aabbA.max.y - aabbA.min.y;
  const heightB = aabbB.max.y - aabbB.min.y;

  // Check if tops are aligned
  const topDiff = Math.abs(aabbA.max.y - aabbB.max.y);

  // Check if bottoms are aligned
  const bottomDiff = Math.abs(aabbA.min.y - aabbB.min.y);

  // Score based on alignment (smaller difference = higher score)
  const maxHeight = Math.max(heightA, heightB);
  const topScore = 1 - Math.min(topDiff / maxHeight, 1);
  const bottomScore = 1 - Math.min(bottomDiff / maxHeight, 1);

  // Return best alignment (either top or bottom aligned)
  return Math.max(topScore, bottomScore);
}

// ============================================
// DEPTH ALIGNMENT SCORING
// ============================================

/**
 * Calculate depth alignment score (for front faces)
 *
 * @param aabbA - First AABB
 * @param aabbB - Second AABB
 * @returns Score from 0-1 (1 = front faces aligned)
 */
export function calculateDepthAlignmentScore(aabbA: AABB, aabbB: AABB): number {
  const frontDiff = Math.abs(aabbA.max.z - aabbB.max.z);
  const depthA = aabbA.max.z - aabbA.min.z;
  const depthB = aabbB.max.z - aabbB.min.z;
  const maxDepth = Math.max(depthA, depthB);

  return 1 - Math.min(frontDiff / maxDepth, 1);
}
