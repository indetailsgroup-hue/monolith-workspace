/**
 * Bolt Orientation Utilities (v1.0)
 *
 * Vector math utilities for computing bolt orientation with proper
 * seam direction and twist angle calculations.
 *
 * KEY INSIGHT:
 * - boltDir = drilling axis ONLY (NOT bolt→cam vector)
 * - boltPanelNormal = normal of SIDE panel (±X), NOT TOP/BOTTOM (±Y)
 * - seamDir = cross(boltPanelNormal, boltDir)
 *
 * WORLD AXES (project convention):
 * - +X = Right
 * - +Y = Up
 * - +Z = Depth (front to back)
 *
 * BOLT MODEL AXES (from boltOrientationPolicy.ts):
 * - MODEL_UP_AXIS = +Y (ball head points here)
 * - SPIN_REFERENCE_AXIS = +X (fins extend along +X)
 * - Bolt shaft extends in -Y direction
 */

import * as THREE from 'three';

// ============================================
// CONSTANTS
// ============================================

const EPS = 1e-6;

/** World coordinate axes */
export const WORLD = {
  X_POS: new THREE.Vector3(1, 0, 0),
  X_NEG: new THREE.Vector3(-1, 0, 0),
  Y_POS: new THREE.Vector3(0, 1, 0),
  Y_NEG: new THREE.Vector3(0, -1, 0),
  Z_POS: new THREE.Vector3(0, 0, 1),
  Z_NEG: new THREE.Vector3(0, 0, -1),
} as const;

/** Bolt model local axes (from boltOrientationPolicy.ts contract) */
export const BOLT_MODEL = {
  /**
   * MODEL SHAFT DIRECTION: The direction the bolt shaft extends in LOCAL space.
   *
   * In the Minifix bolt model:
   * - Ball head is at +Y (top)
   * - Shaft extends toward -Y (bottom)
   *
   * When drilling:
   * - TOP corners: drill DOWN (-Y) → shaft should go INTO panel (down)
   * - BOTTOM corners: drill UP (+Y) → shaft should go INTO panel (up)
   *
   * We want: MODEL_SHAFT → boltDirWorld
   * So MODEL_SHAFT = -Y (shaft extends downward in model space)
   */
  SHAFT_AXIS: new THREE.Vector3(0, -1, 0),
  /** Axis along which fins extend (the 5.8mm width direction) */
  FINS_AXIS: new THREE.Vector3(1, 0, 0),
} as const;

export type Corner = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';
export type MountType = 'INSET' | 'OVERLAY';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Safe normalize that throws on zero-length vectors.
 */
export function safeNormalize(v: THREE.Vector3, label = 'vec'): THREE.Vector3 {
  const len = v.length();
  if (len < EPS) {
    throw new Error(`[safeNormalize] ${label}: zero-length vector`);
  }
  return v.clone().divideScalar(len);
}

/**
 * Check if vector is approximately zero.
 */
export function isZeroVector(v: THREE.Vector3, epsilon = EPS): boolean {
  return v.lengthSq() < epsilon * epsilon;
}

/**
 * Project vector v onto plane orthogonal to axis (axis should be unit).
 */
export function projectOntoPlane(v: THREE.Vector3, axisUnit: THREE.Vector3): THREE.Vector3 {
  const a = axisUnit;
  return v.clone().sub(a.clone().multiplyScalar(v.dot(a)));
}

/**
 * Signed angle from a → b around axis (right-hand rule).
 * a and b must be non-zero and NOT parallel to axis after projection.
 *
 * @returns angle in radians, positive = counter-clockwise when looking along axis
 */
export function signedAngleAroundAxis(
  a: THREE.Vector3,
  b: THREE.Vector3,
  axisUnit: THREE.Vector3,
  label = 'signedAngle'
): number {
  const aP = projectOntoPlane(a, axisUnit);
  const bP = projectOntoPlane(b, axisUnit);

  if (isZeroVector(aP) || isZeroVector(bP)) {
    // Degenerate case: vectors parallel to axis
    return 0;
  }

  const aN = safeNormalize(aP, `${label}:aProj`);
  const bN = safeNormalize(bP, `${label}:bProj`);

  // Angle magnitude
  const dot = THREE.MathUtils.clamp(aN.dot(bN), -1, 1);
  const angle = Math.acos(dot);

  // Sign via triple product: sign = axis · (a × b)
  const cross = aN.clone().cross(bN);
  const sign = Math.sign(axisUnit.dot(cross));

  return angle * (sign === 0 ? 1 : sign);
}

// ============================================
// BOLT ORIENTATION FUNCTIONS
// ============================================

/**
 * Select bolt panel normal based on corner.
 *
 * Bolt is drilled into LEFT or RIGHT side panel.
 * - LEFT side panel inner face normal = +X (pointing right, into cabinet)
 * - RIGHT side panel inner face normal = -X (pointing left, into cabinet)
 *
 * IMPORTANT: This is the normal of the SIDE panel, NOT TOP/BOTTOM!
 */
export function selectBoltPanelNormalWorld(corner: Corner): THREE.Vector3 {
  // Bolt on LEFT/RIGHT side panel (not top/bottom face)
  if (corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT') {
    return WORLD.X_POS.clone(); // LEFT side inner face → +X
  }
  return WORLD.X_NEG.clone(); // RIGHT side inner face → -X
}

/**
 * Compute seam direction from panel normal and bolt direction.
 *
 * seamDir = normalize(cross(boltPanelNormal, boltDir))
 *
 * The seam runs along the joint edge where two panels meet.
 * For cabinet corners, this is typically along the Z axis (depth).
 */
export function computeSeamDirWorld(
  boltPanelNormalWorld: THREE.Vector3,
  boltDirWorld: THREE.Vector3
): THREE.Vector3 | null {
  const n = safeNormalize(boltPanelNormalWorld, 'boltPanelNormal');
  const d = safeNormalize(boltDirWorld, 'boltDir');

  // seamDir = n × d
  const seam = n.clone().cross(d);

  if (isZeroVector(seam)) {
    // Degenerate: boltDir parallel to panel normal
    return null;
  }

  return safeNormalize(seam, 'seamDir');
}

/**
 * Compute seam perpendicular direction (for OVERLAY mode).
 *
 * seamPerp = normalize(cross(boltDir, seamDir))
 *
 * This is 90° rotated from seamDir, in the plane perpendicular to boltDir.
 */
export function computeSeamPerpWorld(
  seamDirWorld: THREE.Vector3,
  boltDirWorld: THREE.Vector3
): THREE.Vector3 {
  const d = safeNormalize(boltDirWorld, 'boltDir');
  const s = safeNormalize(seamDirWorld, 'seamDir');

  // seamPerp = boltDir × seamDir (right-hand rule)
  const perp = d.clone().cross(s);
  return safeNormalize(perp, 'seamPerp');
}

/**
 * Compute base quaternion that aligns bolt model's shaft with drilling direction.
 *
 * This rotates MODEL_SHAFT_AXIS (-Y) to boltDirWorld.
 *
 * Why -Y?
 * - Model's shaft extends toward -Y (ball head at +Y, shaft going down)
 * - For TOP corners (boltDir = -Y): we want shaft going DOWN = no rotation needed
 * - For BOTTOM corners (boltDir = +Y): we want shaft going UP = 180° flip
 */
export function computeBoltQuatBase(boltDirWorld: THREE.Vector3): THREE.Quaternion {
  const from = BOLT_MODEL.SHAFT_AXIS.clone();
  const to = safeNormalize(boltDirWorld, 'boltDirWorld');

  // Handle parallel/antiparallel cases
  const dot = from.dot(to);

  if (dot > 1 - EPS) {
    // Already aligned
    return new THREE.Quaternion();
  }

  if (dot < -1 + EPS) {
    // Opposite direction: rotate 180° around X axis
    return new THREE.Quaternion().setFromAxisAngle(WORLD.X_POS, Math.PI);
  }

  return new THREE.Quaternion().setFromUnitVectors(from, to);
}

/**
 * Main function: Compute bolt quaternion with proper twist.
 *
 * ALGORITHM:
 * 1. Base alignment: rotate MODEL_FORWARD (+Y) → boltDirWorld
 * 2. Find where fins end up after base alignment
 * 3. Compute target direction based on mount type:
 *    - INSET: fins align with seamDir (along joint edge)
 *    - OVERLAY: fins align with seamPerp (perpendicular to joint edge)
 * 4. Compute signed twist angle to rotate fins from current to target
 * 5. Apply twist around boltDirWorld axis
 *
 * SINGULARITY HANDLING:
 * When boltDir is parallel to boltPanelNormal (e.g., INSET where both are X-axis),
 * cross(panelNormal, boltDir) = 0. In this case, we force seamDir = Z-axis (depth).
 */
export function computeBoltQuatWithTwist(params: {
  boltDirWorld: THREE.Vector3;        // Drilling axis (MUST be the single source of truth)
  boltPanelNormalWorld: THREE.Vector3; // ±X for SIDE panels
  mountType: MountType;               // INSET or OVERLAY
}): {
  boltQuat: THREE.Quaternion;
  seamDirWorld: THREE.Vector3 | null;
  targetDirWorld: THREE.Vector3 | null;
  finsWorldBeforeTwist: THREE.Vector3;
  finsWorldAfterTwist: THREE.Vector3;
  twistRad: number;
} {
  const boltDir = safeNormalize(params.boltDirWorld, 'boltDirWorld');
  const boltPanelN = safeNormalize(params.boltPanelNormalWorld, 'boltPanelNormalWorld');

  // 1. Compute seam direction
  let seamDir = computeSeamDirWorld(boltPanelN, boltDir);

  // SINGULARITY HANDLING: When boltDir || boltPanelNormal (e.g., INSET with X-axis drilling)
  // Force seamDir = Z-axis (depth direction, which is perpendicular to both X and Y)
  if (!seamDir) {
    // Check if both vectors are along X-axis (INSET case)
    const isXAxisDrilling = Math.abs(boltDir.x) > 0.9;
    const isXAxisPanel = Math.abs(boltPanelN.x) > 0.9;

    if (isXAxisDrilling && isXAxisPanel) {
      // INSET singularity: both boltDir and panelNormal are X-axis
      // Seam runs along Z-axis (depth direction)
      // Sign depends on drilling direction for consistency
      seamDir = boltDir.x > 0 ? WORLD.Z_NEG.clone() : WORLD.Z_POS.clone();
    } else {
      // Other degenerate case: return base alignment with no twist
      const qBase = computeBoltQuatBase(boltDir);
      const finsBefore = BOLT_MODEL.FINS_AXIS.clone().applyQuaternion(qBase);
      return {
        boltQuat: qBase,
        seamDirWorld: null,
        targetDirWorld: null,
        finsWorldBeforeTwist: finsBefore,
        finsWorldAfterTwist: finsBefore,
        twistRad: 0,
      };
    }
  }

  // 2. Compute target direction based on mount type
  const targetDir =
    params.mountType === 'INSET'
      ? seamDir.clone()
      : computeSeamPerpWorld(seamDir, boltDir);

  // 3. Base alignment quaternion
  const qBase = computeBoltQuatBase(boltDir);

  // 4. Where do fins end up after base alignment?
  const finsBefore = BOLT_MODEL.FINS_AXIS.clone().applyQuaternion(qBase);

  // 5. Compute signed twist angle around boltDir
  const twistRad = signedAngleAroundAxis(finsBefore, targetDir, boltDir, 'twist');

  // 6. Create twist quaternion
  const qTwist = new THREE.Quaternion().setFromAxisAngle(boltDir, twistRad);

  // 7. Final quaternion: apply base, then twist
  // Order: qFinal = qTwist * qBase (twist applied in world frame)
  const qFinal = qTwist.clone().multiply(qBase);

  // 8. Verify: fins after twist
  const finsAfter = BOLT_MODEL.FINS_AXIS.clone().applyQuaternion(qFinal);

  return {
    boltQuat: qFinal,
    seamDirWorld: seamDir,
    targetDirWorld: targetDir,
    finsWorldBeforeTwist: finsBefore,
    finsWorldAfterTwist: finsAfter,
    twistRad,
  };
}

// ============================================
// DEBUG & VALIDATION
// ============================================

/**
 * Format vector for debug logging.
 */
export function formatVec(v: THREE.Vector3): string {
  return `[${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)}]`;
}

/**
 * Debug log orientation calculation.
 */
export function debugOrientation(
  tag: string,
  result: ReturnType<typeof computeBoltQuatWithTwist>,
  boltDir: THREE.Vector3,
  boltPanelN: THREE.Vector3
): void {
  console.group(`[BoltOrientation] ${tag}`);
  console.log('boltDirWorld:', formatVec(safeNormalize(boltDir, 'boltDir')));
  console.log('boltPanelNormal:', formatVec(safeNormalize(boltPanelN, 'panelN')));
  console.log('seamDir:', result.seamDirWorld ? formatVec(result.seamDirWorld) : 'null');
  console.log('targetDir:', result.targetDirWorld ? formatVec(result.targetDirWorld) : 'null');
  console.log('finsBefore:', formatVec(result.finsWorldBeforeTwist));
  console.log('finsAfter:', formatVec(result.finsWorldAfterTwist));
  console.log('twistDeg:', THREE.MathUtils.radToDeg(result.twistRad).toFixed(2));
  console.groupEnd();
}

/**
 * Assert that orientation is correct.
 *
 * Checks:
 * 1. finsAfterTwist is parallel to targetDir (dot ≈ ±1)
 * 2. finsAfterTwist is perpendicular to boltDir (dot ≈ 0)
 * 3. targetDir is perpendicular to boltDir (dot ≈ 0)
 */
export function assertOrientation(
  result: ReturnType<typeof computeBoltQuatWithTwist>,
  boltDirWorld: THREE.Vector3,
  tolerance = 1e-3
): void {
  if (!result.targetDirWorld) {
    // Can't validate degenerate case
    return;
  }

  const boltDir = safeNormalize(boltDirWorld, 'boltDir');
  const fins = safeNormalize(result.finsWorldAfterTwist, 'finsAfter');
  const target = safeNormalize(result.targetDirWorld, 'target');

  // 1. Fins parallel to target (allow flipped)
  const dotFT = THREE.MathUtils.clamp(fins.dot(target), -1, 1);
  if (Math.abs(Math.abs(dotFT) - 1) > tolerance) {
    throw new Error(
      `[ASSERT] fins not parallel to target: dot=${dotFT.toFixed(4)}, ` +
      `fins=${formatVec(fins)}, target=${formatVec(target)}`
    );
  }

  // 2. Fins perpendicular to boltDir
  const dotFB = fins.dot(boltDir);
  if (Math.abs(dotFB) > tolerance) {
    throw new Error(
      `[ASSERT] fins not perpendicular to boltDir: dot=${dotFB.toFixed(4)}`
    );
  }

  // 3. Target perpendicular to boltDir
  const dotTB = target.dot(boltDir);
  if (Math.abs(dotTB) > tolerance) {
    throw new Error(
      `[ASSERT] target not perpendicular to boltDir: dot=${dotTB.toFixed(4)}`
    );
  }
}

// ============================================
// FRONT VIEW VALIDATION (Chief Geometry Architect spec)
// ============================================

/**
 * Bolt state for front view validation
 */
export interface BoltStateForValidation {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  jointType: MountType;
  corner: Corner;
}

/**
 * Validate bolt orientation from Front View (XY Plane projection).
 *
 * This function checks what the camera sees from the front:
 * 1. Position Boundary: Bolt must be inside cabinet bounding box
 * 2. Fins Projection Check:
 *    - INSET: Fins point toward Z (depth), so X component ≈ 0 in front view
 *    - OVERLAY: Fins point toward X (width), so X component ≈ 1 in front view
 *
 * @param bolt - Bolt state (position, quaternion, jointType, corner)
 * @param cabinetBox - Cabinet bounding box for boundary check
 * @param tolerance - Tolerance for floating point comparison (default 0.01)
 * @throws Error if validation fails
 * @returns true if validation passes
 */
export function validateFrontViewOrientation(
  bolt: BoltStateForValidation,
  cabinetBox: THREE.Box3,
  tolerance = 0.01
): boolean {
  // 1. Boundary Check: Bolt position must be inside cabinet
  if (!cabinetBox.containsPoint(bolt.position)) {
    throw new Error(
      `[Boundary Fail] Bolt at ${bolt.corner} is outside cabinet bounds. ` +
      `Pos: ${formatVec(bolt.position)}, ` +
      `Box: min=${formatVec(cabinetBox.min)}, max=${formatVec(cabinetBox.max)}`
    );
  }

  // 2. Calculate world-space fin direction
  // BOLT_MODEL.FINS_AXIS = +X in local space
  const localFinAxis = BOLT_MODEL.FINS_AXIS.clone();
  const worldFinDir = localFinAxis.applyQuaternion(bolt.quaternion).normalize();

  // 3. Front View Projection Check (XY plane)
  // We check the X component of the fin direction
  const xComponent = Math.abs(worldFinDir.x);
  const zComponent = Math.abs(worldFinDir.z);

  if (bolt.jointType === 'INSET') {
    // INSET: Fins must point toward Z (depth direction)
    // In front view (XY plane), fins should appear as a point (no X extent)
    // So |finDir.z| ≈ 1 and |finDir.x| ≈ 0
    if (zComponent < 1 - tolerance) {
      throw new Error(
        `[Orientation Fail] ${bolt.corner} INSET: Fins should point toward Z (depth). ` +
        `Expected |Z| ≈ 1, got ${zComponent.toFixed(4)}. ` +
        `WorldFinDir: ${formatVec(worldFinDir)}`
      );
    }
    if (xComponent > tolerance) {
      throw new Error(
        `[Orientation Fail] ${bolt.corner} INSET: Fins have unexpected X component. ` +
        `Expected |X| ≈ 0, got ${xComponent.toFixed(4)}. ` +
        `WorldFinDir: ${formatVec(worldFinDir)}`
      );
    }
  } else {
    // OVERLAY: Fins must point toward X (width direction)
    // In front view, fins should extend horizontally
    // So |finDir.x| ≈ 1 and |finDir.z| ≈ 0
    if (xComponent < 1 - tolerance) {
      throw new Error(
        `[Orientation Fail] ${bolt.corner} OVERLAY: Fins should point toward X (width). ` +
        `Expected |X| ≈ 1, got ${xComponent.toFixed(4)}. ` +
        `WorldFinDir: ${formatVec(worldFinDir)}`
      );
    }
    if (zComponent > tolerance) {
      throw new Error(
        `[Orientation Fail] ${bolt.corner} OVERLAY: Fins have unexpected Z component. ` +
        `Expected |Z| ≈ 0, got ${zComponent.toFixed(4)}. ` +
        `WorldFinDir: ${formatVec(worldFinDir)}`
      );
    }
  }

  return true;
}

/**
 * Validate bolt orientation from Side View (YZ Plane projection).
 *
 * Complementary check for thoroughness:
 * - INSET: Fins extend in Z, visible as horizontal line in side view
 * - OVERLAY: Fins extend in X, visible as a point in side view
 *
 * @param bolt - Bolt state
 * @param tolerance - Tolerance for comparison
 * @throws Error if validation fails
 * @returns true if validation passes
 */
export function validateSideViewOrientation(
  bolt: BoltStateForValidation,
  tolerance = 0.01
): boolean {
  const localFinAxis = BOLT_MODEL.FINS_AXIS.clone();
  const worldFinDir = localFinAxis.applyQuaternion(bolt.quaternion).normalize();

  const xComponent = Math.abs(worldFinDir.x);
  const zComponent = Math.abs(worldFinDir.z);

  if (bolt.jointType === 'INSET') {
    // INSET: In side view (YZ plane), fins should appear horizontal (Z direction)
    if (zComponent < 1 - tolerance) {
      throw new Error(
        `[Side View Fail] ${bolt.corner} INSET: Fins should extend in Z. ` +
        `Expected |Z| ≈ 1, got ${zComponent.toFixed(4)}`
      );
    }
  } else {
    // OVERLAY: In side view (YZ plane), fins should appear as point (X direction)
    if (xComponent < 1 - tolerance) {
      throw new Error(
        `[Side View Fail] ${bolt.corner} OVERLAY: Fins should extend in X. ` +
        `Expected |X| ≈ 1, got ${xComponent.toFixed(4)}`
      );
    }
  }

  return true;
}

/**
 * Get drilling axis for a corner based on joint type and position.
 *
 * INSET (shelves between side panels):
 *   - Bolt drilled HORIZONTALLY (X-axis) into FACE of side panel
 *   - LEFT corners: drill RIGHT (+X) into left panel face
 *   - RIGHT corners: drill LEFT (-X) into right panel face
 *
 * OVERLAY (side panels on top/bottom of shelves):
 *   - Bolt drilled VERTICALLY (Y-axis) into EDGE of side panel
 *   - TOP corners: drill DOWN (-Y) into top edge
 *   - BOTTOM corners: drill UP (+Y) into bottom edge
 */
export function getDrillingAxis(corner: Corner, jointType: MountType = 'OVERLAY'): THREE.Vector3 {
  const isTop = corner === 'TOP_LEFT' || corner === 'TOP_RIGHT';
  const isLeft = corner === 'TOP_LEFT' || corner === 'BOTTOM_LEFT';

  if (jointType === 'INSET') {
    // INSET FIX: Origin is at Cam (in Shelf) → bolt head points OUT toward Side Panel
    // Left Panel: bolt head points LEFT (-X)
    // Right Panel: bolt head points RIGHT (+X)
    return isLeft ? WORLD.X_NEG.clone() : WORLD.X_POS.clone();
  } else {
    // OVERLAY: Bolt drilled VERTICALLY into edge of Side Panel
    return isTop ? WORLD.Y_NEG.clone() : WORLD.Y_POS.clone();
  }
}
