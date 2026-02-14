/**
 * cabinetSnap.ts - Cabinet Snap Engine
 *
 * ALGORITHM:
 * 1. Candidate Generation - หา anchor pairs ที่เข้าคู่กันได้
 * 2. Scoring - เลือก candidate ที่ intent สูงสุด
 * 3. Solve - คำนวณ transform ใหม่ของ Cabinet B
 * 4. Validate - ตรวจ collision/clearance
 * 5. Commit - บันทึกเป็น History Feature
 *
 * CONSTANTS:
 * - snapThreshold = 50mm
 * - minGap = 1mm
 * - angleThreshold = 5°
 */

import {
  Vec3,
  Plane,
  Transform,
  AABB,
  AnchorKind,
  CabinetAnchor,
  SnapType,
  SnapCompatibilityPair,
  SnapConstants,
  SnapCandidate,
  SnapResult,
  SnapCabinetInstance,
  CabinetDimensions,
  SnapAlignment,
  CabinetSnapParams,
  DEFAULT_SNAP_CONSTANTS,
} from '../types/SnapTypes';

// ============================================
// VECTOR MATH UTILITIES
// ============================================

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function mul(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function len(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const l = len(a);
  if (l < 1e-9) return { x: 0, y: 0, z: 0 };
  return mul(a, 1 / l);
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ============================================
// PLANE UTILITIES
// ============================================

/**
 * Angle in degrees between two normal vectors
 */
export function angleDegBetweenNormals(n1: Vec3, n2: Vec3): number {
  const c = dot(n1, n2) / (len(n1) * len(n2) + 1e-9);
  const cc = clamp(c, -1, 1);
  return Math.acos(cc) * (180 / Math.PI);
}

/**
 * Signed distance from point p to plane
 * Positive = in front of plane (along normal)
 * Negative = behind plane
 */
export function signedDistanceToPlane(p: Vec3, plane: Plane): number {
  return dot(sub(p, plane.origin), plane.normal);
}

/**
 * Distance between two planes along A's normal direction
 */
export function planeSeparationAlongA(planeA: Plane, planeB: Plane): number {
  return signedDistanceToPlane(planeB.origin, planeA);
}

// ============================================
// AABB UTILITIES
// ============================================

export function aabbOverlap(a: AABB, b: AABB): boolean {
  return (
    a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z
  );
}

export function aabbFromTransformAndDimensions(
  transform: Transform,
  dimensions: CabinetDimensions
): AABB {
  // Simple axis-aligned box (assumes no rotation for simplicity)
  // For rotated cabinets, would need OBB or transform the corners
  const halfW = dimensions.width / 2;
  const halfH = dimensions.height / 2;
  const halfD = dimensions.depth / 2;

  // Position is CENTER of cabinet
  return {
    min: {
      x: transform.position.x - halfW,
      y: transform.position.y - halfH,
      z: transform.position.z - halfD,
    },
    max: {
      x: transform.position.x + halfW,
      y: transform.position.y + halfH,
      z: transform.position.z + halfD,
    },
  };
}

// ============================================
// ANCHOR GENERATION
// ============================================

/**
 * Generate anchor planes for a cabinet based on its dimensions and transform
 * Cabinet origin is at CENTER
 */
export function generateCabinetAnchors(
  cabinetId: string,
  transform: Transform,
  dimensions: CabinetDimensions
): CabinetAnchor[] {
  const { width, height, depth } = dimensions;
  const { position } = transform;

  const halfW = width / 2;
  const halfH = height / 2;
  const halfD = depth / 2;

  const anchors: CabinetAnchor[] = [
    // LEFT face (negative X)
    {
      id: `${cabinetId}-anchor-left`,
      kind: 'FACE_LEFT',
      plane: {
        origin: { x: position.x - halfW, y: position.y, z: position.z },
        normal: { x: -1, y: 0, z: 0 },
      },
      snapPriority: 100,
    },
    // RIGHT face (positive X)
    {
      id: `${cabinetId}-anchor-right`,
      kind: 'FACE_RIGHT',
      plane: {
        origin: { x: position.x + halfW, y: position.y, z: position.z },
        normal: { x: 1, y: 0, z: 0 },
      },
      snapPriority: 100,
    },
    // FRONT face (positive Z - toward camera)
    {
      id: `${cabinetId}-anchor-front`,
      kind: 'FACE_FRONT',
      plane: {
        origin: { x: position.x, y: position.y, z: position.z + halfD },
        normal: { x: 0, y: 0, z: 1 },
      },
      snapPriority: 80,
    },
    // BACK face (negative Z)
    {
      id: `${cabinetId}-anchor-back`,
      kind: 'FACE_BACK',
      plane: {
        origin: { x: position.x, y: position.y, z: position.z - halfD },
        normal: { x: 0, y: 0, z: -1 },
      },
      snapPriority: 70,
    },
    // TOP face (positive Y)
    {
      id: `${cabinetId}-anchor-top`,
      kind: 'FACE_TOP',
      plane: {
        origin: { x: position.x, y: position.y + halfH, z: position.z },
        normal: { x: 0, y: 1, z: 0 },
      },
      snapPriority: 60,
    },
    // BOTTOM face (negative Y)
    {
      id: `${cabinetId}-anchor-bottom`,
      kind: 'FACE_BOTTOM',
      plane: {
        origin: { x: position.x, y: position.y - halfH, z: position.z },
        normal: { x: 0, y: -1, z: 0 },
      },
      snapPriority: 50,
    },
  ];

  return anchors;
}

/**
 * Convert existing cabinet to SnapCabinetInstance
 * Accepts corner-based position (scenePosition) and converts to center-based
 */
export function cabinetToSnapInstance(
  id: string,
  cornerPosition: [number, number, number],
  dimensions: CabinetDimensions,
  rotationY: number = 0
): SnapCabinetInstance {
  // Convert corner position to center position
  const centerPosition: Vec3 = {
    x: cornerPosition[0] + dimensions.width / 2,
    y: cornerPosition[1] + dimensions.height / 2,
    z: cornerPosition[2] + dimensions.depth / 2,
  };

  const transform: Transform = {
    position: centerPosition,
    rotationEuler: { x: 0, y: rotationY, z: 0 },
  };

  const anchors = generateCabinetAnchors(id, transform, dimensions);
  const envelope = aabbFromTransformAndDimensions(transform, dimensions);

  return {
    id,
    transform,
    dimensions,
    anchors,
    envelope,
  };
}

// ============================================
// SNAP COMPATIBILITY TABLE
// ============================================

/**
 * Define which anchor pairs can snap together
 */
export function getCompatibilityPairs(): SnapCompatibilityPair[] {
  return [
    // SIDE_JOIN: Right-to-Left or Left-to-Right (most common)
    { type: 'SIDE_JOIN', a: 'FACE_RIGHT', b: 'FACE_LEFT', expected: 'OPPOSED', priority: 100 },
    { type: 'SIDE_JOIN', a: 'FACE_LEFT', b: 'FACE_RIGHT', expected: 'OPPOSED', priority: 100 },

    // FLUSH_FRONT: Front faces aligned (same plane)
    { type: 'FLUSH_FRONT', a: 'FACE_FRONT', b: 'FACE_FRONT', expected: 'ALIGNED', priority: 80 },

    // BACK_ALIGN: Back faces aligned (island/peninsula)
    { type: 'BACK_ALIGN', a: 'FACE_BACK', b: 'FACE_BACK', expected: 'ALIGNED', priority: 70 },

    // STACK: Top of A to Bottom of B (stacking cabinets)
    { type: 'STACK', a: 'FACE_TOP', b: 'FACE_BOTTOM', expected: 'OPPOSED', priority: 60 },
  ];
}

// ============================================
// CANDIDATE GENERATION & SCORING
// ============================================

function getAnchor(cab: SnapCabinetInstance, kind: AnchorKind): CabinetAnchor | null {
  return cab.anchors.find(a => a.kind === kind) ?? null;
}

/**
 * Calculate score for a snap candidate
 * Higher score = more likely intended by user
 */
function scoreCandidate(
  distanceMm: number,
  angleErrDeg: number,
  basePriority: number,
  constants: SnapConstants
): number {
  // Distance score: closer = higher (max 1.0 at 0mm, 0 at threshold)
  const dScore = 1 - clamp01(distanceMm / constants.snapThresholdMm);

  // Angle score: smaller error = higher (max 1.0 at 0°, 0 at threshold)
  const aScore = 1 - clamp01(angleErrDeg / constants.angleThresholdDeg);

  // Priority score: normalized 0-1
  const pScore = basePriority / 100;

  // Weights: distance dominates, then angle, then priority
  return (dScore * 0.60) + (aScore * 0.25) + (pScore * 0.15);
}

/**
 * Find the best snap candidate between two cabinets
 */
export function findBestSnapCandidate(
  cabA: SnapCabinetInstance,
  cabB: SnapCabinetInstance,
  constants: SnapConstants = DEFAULT_SNAP_CONSTANTS
): SnapCandidate | null {
  let best: SnapCandidate | null = null;

  for (const pair of getCompatibilityPairs()) {
    const aAnchor = getAnchor(cabA, pair.a);
    const bAnchor = getAnchor(cabB, pair.b);

    if (!aAnchor || !bAnchor) continue;

    // Calculate angle between normals
    const angle = angleDegBetweenNormals(aAnchor.plane.normal, bAnchor.plane.normal);

    // For OPPOSED faces, ideal angle = 180° (normals point at each other)
    // For ALIGNED faces, ideal angle = 0° (normals parallel, same direction)
    const angleErrDeg = pair.expected === 'OPPOSED'
      ? Math.abs(180 - angle)
      : Math.abs(angle);

    // Reject if too rotated (prevents weird snaps)
    if (angleErrDeg > constants.angleThresholdDeg) continue;

    // Calculate plane separation
    const sep = Math.abs(planeSeparationAlongA(aAnchor.plane, bAnchor.plane));

    // Reject if too far
    if (sep > constants.snapThresholdMm) continue;

    // Calculate score
    const score = scoreCandidate(sep, angleErrDeg, pair.priority, constants);

    const candidate: SnapCandidate = {
      type: pair.type,
      aCabId: cabA.id,
      bCabId: cabB.id,
      aAnchorId: aAnchor.id,
      bAnchorId: bAnchor.id,
      aAnchorKind: aAnchor.kind,
      bAnchorKind: bAnchor.kind,
      distanceMm: sep,
      angleErrorDeg: angleErrDeg,
      score,
    };

    if (!best || candidate.score > best.score) {
      best = candidate;
    }
  }

  return best;
}

/**
 * Find all valid snap candidates between cabinet B and all other cabinets
 */
export function findAllSnapCandidates(
  movingCabinet: SnapCabinetInstance,
  otherCabinets: SnapCabinetInstance[],
  constants: SnapConstants = DEFAULT_SNAP_CONSTANTS
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];

  for (const otherCab of otherCabinets) {
    if (otherCab.id === movingCabinet.id) continue;

    const candidate = findBestSnapCandidate(otherCab, movingCabinet, constants);
    if (candidate) {
      candidates.push(candidate);
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

// ============================================
// SOLVE TRANSFORM
// ============================================

/**
 * Solve rigid snap: translate B only (keep rotation)
 * Move B such that its anchor plane is minGap away from A anchor plane
 */
export function solveRigidSnap(
  cabA: SnapCabinetInstance,
  cabB: SnapCabinetInstance,
  candidate: SnapCandidate,
  constants: SnapConstants = DEFAULT_SNAP_CONSTANTS,
  alignment: SnapAlignment = {}
): SnapResult {
  const aAnchor = cabA.anchors.find(x => x.id === candidate.aAnchorId);
  const bAnchor = cabB.anchors.find(x => x.id === candidate.bAnchorId);

  if (!aAnchor || !bAnchor) {
    return {
      candidate,
      resolvedTransformB: cabB.transform,
      delta: { x: 0, y: 0, z: 0 },
      isValid: false,
      validationErrors: ['Anchor not found'],
    };
  }

  // Start with current position
  let newPos = { ...cabB.transform.position };

  // Calculate translation along the snap axis
  const signedSep = planeSeparationAlongA(aAnchor.plane, bAnchor.plane);

  // Target separation is minGap (positive = B is in front of A along A's normal)
  // For OPPOSED faces (SIDE_JOIN), we want B to be minGap away
  // For ALIGNED faces, we want planes coincident (or minGap for z-fighting prevention)
  const targetSep = candidate.type === 'SIDE_JOIN' || candidate.type === 'STACK'
    ? constants.minGapMm
    : 0; // For FLUSH_FRONT/BACK_ALIGN, planes should coincide

  const deltaAlongNormal = targetSep - signedSep;
  const primaryDelta = mul(aAnchor.plane.normal, deltaAlongNormal);

  newPos = add(newPos, primaryDelta);

  // Apply secondary alignment constraints
  const alignDelta: Vec3 = { x: 0, y: 0, z: 0 };

  if (alignment.alignBottom) {
    // Align bottoms - both cabinets on floor (Y=height/2 for center position)
    const targetY = cabB.dimensions.height / 2;
    alignDelta.y = targetY - newPos.y;
  }

  if (alignment.alignTop) {
    // Align top edges
    const aTop = cabA.transform.position.y + cabA.dimensions.height / 2;
    const bTop = newPos.y + cabB.dimensions.height / 2;
    alignDelta.y = aTop - bTop;
  }

  if (alignment.alignFrontFlush && candidate.type === 'SIDE_JOIN') {
    // Align front faces for side join
    const aFront = cabA.transform.position.z + cabA.dimensions.depth / 2;
    const bFront = newPos.z + cabB.dimensions.depth / 2;
    alignDelta.z = aFront - bFront;
  }

  if (alignment.alignBackFlush && candidate.type === 'SIDE_JOIN') {
    // Align back faces for side join
    const aBack = cabA.transform.position.z - cabA.dimensions.depth / 2;
    const bBack = newPos.z - cabB.dimensions.depth / 2;
    alignDelta.z = aBack - bBack;
  }

  newPos = add(newPos, alignDelta);

  // Total delta from original position
  const totalDelta = sub(newPos, cabB.transform.position);

  const resolvedTransform: Transform = {
    position: newPos,
    rotationEuler: cabB.transform.rotationEuler, // Keep rotation unchanged
  };

  return {
    candidate,
    resolvedTransformB: resolvedTransform,
    delta: totalDelta,
    isValid: true,
    validationErrors: [],
  };
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate snap result - check for collisions and manufacturing constraints
 */
export function validateSnapResult(
  cabA: SnapCabinetInstance,
  cabB: SnapCabinetInstance,
  result: SnapResult,
  constants: SnapConstants
): SnapResult {
  const errors: string[] = [];

  // Create new AABB for B at resolved position
  const newEnvelopeB = aabbFromTransformAndDimensions(
    result.resolvedTransformB,
    cabB.dimensions
  );

  const envelopeA = cabA.envelope || aabbFromTransformAndDimensions(
    cabA.transform,
    cabA.dimensions
  );

  // Check AABB overlap (collision)
  // For side-by-side placement, we allow touching but not overlapping
  // Shrink AABBs by minGap to allow touching
  const shrunkA: AABB = {
    min: add(envelopeA.min, mul({ x: 1, y: 1, z: 1 }, constants.minGapMm / 2)),
    max: sub(envelopeA.max, mul({ x: 1, y: 1, z: 1 }, constants.minGapMm / 2)),
  };
  const shrunkB: AABB = {
    min: add(newEnvelopeB.min, mul({ x: 1, y: 1, z: 1 }, constants.minGapMm / 2)),
    max: sub(newEnvelopeB.max, mul({ x: 1, y: 1, z: 1 }, constants.minGapMm / 2)),
  };

  if (aabbOverlap(shrunkA, shrunkB)) {
    errors.push('Collision detected: cabinets would overlap');
  }

  // Check minimum gap is maintained
  const aAnchor = cabA.anchors.find(x => x.id === result.candidate.aAnchorId);
  const bAnchor = cabB.anchors.find(x => x.id === result.candidate.bAnchorId);

  if (aAnchor && bAnchor) {
    // Recalculate separation with new position
    const newBPlane: Plane = {
      origin: add(bAnchor.plane.origin, result.delta),
      normal: bAnchor.plane.normal,
    };
    const finalSep = Math.abs(planeSeparationAlongA(aAnchor.plane, newBPlane));

    if (finalSep < constants.minGapMm - 0.1) { // 0.1mm tolerance
      errors.push(`Gap too small: ${finalSep.toFixed(2)}mm < ${constants.minGapMm}mm minimum`);
    }
  }

  return {
    ...result,
    isValid: errors.length === 0,
    validationErrors: errors,
  };
}

// ============================================
// HIGH-LEVEL SNAP FUNCTION
// ============================================

/**
 * Main snap function: find best candidate and solve
 */
export function calculateCabinetSnap(
  movingCabinet: SnapCabinetInstance,
  targetCabinet: SnapCabinetInstance,
  constants: SnapConstants = DEFAULT_SNAP_CONSTANTS,
  alignment: SnapAlignment = { alignBottom: true, alignFrontFlush: true }
): SnapResult | null {
  // Find best snap candidate
  const candidate = findBestSnapCandidate(targetCabinet, movingCabinet, constants);

  if (!candidate) {
    return null;
  }

  // Solve transform
  const result = solveRigidSnap(targetCabinet, movingCabinet, candidate, constants, alignment);

  // Validate
  const validatedResult = validateSnapResult(targetCabinet, movingCabinet, result, constants);

  return validatedResult;
}

/**
 * Find best snap among all cabinets and solve
 */
export function calculateBestSnap(
  movingCabinet: SnapCabinetInstance,
  allCabinets: SnapCabinetInstance[],
  constants: SnapConstants = DEFAULT_SNAP_CONSTANTS,
  alignment: SnapAlignment = { alignBottom: true, alignFrontFlush: true }
): SnapResult | null {
  const candidates = findAllSnapCandidates(movingCabinet, allCabinets, constants);

  if (candidates.length === 0) {
    return null;
  }

  // Try candidates in order of score
  for (const candidate of candidates) {
    const targetCab = allCabinets.find(c => c.id === candidate.aCabId);
    if (!targetCab) continue;

    const result = solveRigidSnap(targetCab, movingCabinet, candidate, constants, alignment);
    const validated = validateSnapResult(targetCab, movingCabinet, result, constants);

    if (validated.isValid) {
      return validated;
    }
  }

  // Return first result even if invalid (for preview with error display)
  const firstCandidate = candidates[0];
  const targetCab = allCabinets.find(c => c.id === firstCandidate.aCabId);
  if (targetCab) {
    const result = solveRigidSnap(targetCab, movingCabinet, firstCandidate, constants, alignment);
    return validateSnapResult(targetCab, movingCabinet, result, constants);
  }

  return null;
}

// ============================================
// UTILITY: Convert result to corner position
// ============================================

/**
 * Convert center-based snap result position to corner-based scenePosition
 */
export function snapResultToCornerPosition(
  result: SnapResult,
  dimensions: CabinetDimensions
): [number, number, number] {
  const center = result.resolvedTransformB.position;
  return [
    center.x - dimensions.width / 2,
    center.y - dimensions.height / 2,
    center.z - dimensions.depth / 2,
  ];
}

// ============================================
// FEATURE HISTORY
// ============================================

/**
 * Create CabinetSnapParams for history feature
 */
export function createSnapParams(
  result: SnapResult,
  constants: SnapConstants,
  alignment: SnapAlignment
): CabinetSnapParams {
  return {
    aCabId: result.candidate.aCabId,
    bCabId: result.candidate.bCabId,
    snapType: result.candidate.type,
    aAnchorId: result.candidate.aAnchorId,
    bAnchorId: result.candidate.bAnchorId,
    aAnchorKind: result.candidate.aAnchorKind,
    bAnchorKind: result.candidate.bAnchorKind,
    snapThresholdMm: constants.snapThresholdMm,
    minGapMm: constants.minGapMm,
    angleThresholdDeg: constants.angleThresholdDeg,
    resolvedTransformB: result.resolvedTransformB,
    delta: result.delta,
    alignment,
    distanceMm: result.candidate.distanceMm,
    angleErrorDeg: result.candidate.angleErrorDeg,
    score: result.candidate.score,
  };
}
