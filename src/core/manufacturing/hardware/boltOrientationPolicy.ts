/**
 * Bolt Orientation Policy (v2.0)
 *
 * Geometry-driven policy for determining bolt render orientation.
 * Uses seam/edge direction to compute twist angle automatically.
 *
 * ARCHITECTURE (v2.0 - Seam-Driven):
 * 1. GEOMETRY LAYER: Compute twist from actual seam direction
 *    - seamDir = direction along joint edge (from panel topology)
 *    - INSET: align with seamDir (horizontal relative to seam)
 *    - OVERLAY: perpendicular to seamDir (+90° from INSET)
 * 2. POLICY LAYER: Optional offset/override via rules
 *    - Hardware-specific adjustments
 *    - Left/right handedness flip
 *    - Custom angles for special cases
 *
 * GEOMETRY CONTRACT:
 * - MODEL_UP_AXIS (+Y): Bolt model's "up" direction (ball head points here)
 * - SPIN_REFERENCE_AXIS (+Z): Reference for 0° twist (horizontal = sleeve fins along Z)
 * - Twist follows RIGHT-HAND RULE around boltDirection
 * - 0° = fins align with seamDir (along joint edge)
 * - 90° = fins perpendicular to seamDir
 *
 * HANDEDNESS:
 * - LEFT side bolts may need sign flip for symmetry
 * - Use getHandednessSign() to compute effective twist
 *
 * BENEFITS OF GEOMETRY-DRIVEN APPROACH:
 * - Works automatically for any panel angle (30°, 45°, 60°, etc.)
 * - No need to add rules for each angle combination
 * - Policy layer remains for hardware-specific overrides
 */

// ============================================
// GEOMETRY CONSTANTS (Contract)
// ============================================

/**
 * Model's "up" axis - ball head points in this direction.
 * Used for base alignment: setFromUnitVectors(MODEL_UP_AXIS, boltDirection)
 */
export const MODEL_UP_AXIS = { x: 0, y: 1, z: 0 } as const;

/**
 * Reference axis for defining 0° twist.
 *
 * MODEL AXIS CONTRACT (S200 bolt mesh in Hardware3D.tsx):
 * - BoxGeometry args: [width=5.8, height=14, depth=0.4]
 * - Fins extend outward along +X (the 5.8mm width dimension)
 * - Fins are tall along +Y (aligns with bolt axis after baseQuat)
 * - Fins are thin along +Z (the 0.4mm depth)
 *
 * Therefore: MODEL_FIN_AXIS = +X, not +Z!
 *
 * At 0° twist, the fin's extension direction (+X in model space) is the reference.
 * After base alignment (MODEL_UP → boltDir), this reference gets rotated accordingly.
 */
export const SPIN_REFERENCE_AXIS = { x: 1, y: 0, z: 0 } as const;

/**
 * Twist follows right-hand rule around boltDirection.
 * Positive angle = counter-clockwise when looking from bolt toward cam.
 */
export const TWIST_HANDEDNESS = 'RIGHT_HAND' as const;

// ============================================
// TYPES
// ============================================

export type JointPosition = 'TOP' | 'BOTTOM';
export type JointMode = 'INSET' | 'OVERLAY';
export type PanelSide = 'LEFT' | 'RIGHT';
export type HardwareModel = 'S200' | 'S100' | 'CUSTOM';
export type CornerType = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';

/** Simple 3D vector type */
export type Vec3 = { x: number; y: number; z: number };

/**
 * Context for resolving bolt orientation.
 * Add more fields as needed for future rules.
 */
export interface BoltOrientationContext {
  jointPosition: JointPosition;
  jointMode: JointMode;
  panelSide?: PanelSide;
  hardwareModel?: HardwareModel;
  // Future fields:
  // materialType?: string;
  // handedness?: 'LEFT' | 'RIGHT';
  // customAngle?: number;
}

/**
 * Extended context for geometry-driven twist calculation.
 * Includes seam direction and bolt axis for automatic computation.
 */
export interface SeamOrientationContext extends BoltOrientationContext {
  /** Corner type for deriving seam direction (legacy fallback) */
  cornerType?: CornerType;
  /** Explicit seam direction (overrides all derivation) */
  seamDirWorld?: Vec3;
  /** Bolt direction (normalized, from A toward cam pocket C) */
  boltDir?: Vec3;
  /** Cam surface normal (for projecting seam onto cam plane) */
  camNormal?: Vec3;
  /** Bolt panel's outward normal (for deriving seam from cross product) */
  boltPanelNormal?: Vec3;
  /** Bolt anchor position in world space (for geometry-first derivation) */
  position?: Vec3;
  /** Cam pocket center in world space (for geometry-first derivation) */
  targetPocketCenter?: Vec3;
}

/**
 * Rule for determining bolt twist angle.
 * Conditions that are undefined are treated as "any" (wildcard).
 */
export interface BoltOrientationRule {
  id: string;
  description: string;
  /** Higher priority rules are evaluated first (default: 0) */
  priority?: number;
  conditions: {
    jointPosition?: JointPosition | JointPosition[];
    jointMode?: JointMode | JointMode[];
    panelSide?: PanelSide | PanelSide[];
    hardwareModel?: HardwareModel | HardwareModel[];
  };
  /** Twist angle in degrees around bolt axis (before handedness adjustment) */
  twistDeg: number;
  /** If true, flip sign for LEFT side panels (for symmetric appearance) */
  flipForLeftSide?: boolean;
}

/**
 * Result of orientation resolution.
 */
export interface BoltOrientationResult {
  /** Final twist angle (after handedness adjustment) */
  twistDeg: number;
  /** Raw twist from rule (before handedness adjustment) */
  rawTwistDeg: number;
  /** Handedness sign applied (+1 or -1) */
  handednessSign: number;
  matchedRuleId: string;
  matchedRuleDescription: string;
  /** Specificity score of matched rule (higher = more specific) */
  specificity: number;
}

// ============================================
// VECTOR UTILITIES
// ============================================

function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function len(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalize(v: Vec3, eps = 1e-9): Vec3 {
  const l = len(v);
  if (l < eps) return vec3(0, 0, 1); // fallback to +Z
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * Project vector onto plane defined by normal.
 * Result is the component of v perpendicular to planeNormal.
 */
function projectOntoPlane(v: Vec3, planeNormal: Vec3): Vec3 {
  const n = normalize(planeNormal);
  const d = dot(v, n);
  return sub(v, scale(n, d));
}

// ============================================
// QUATERNION UTILITIES (matches THREE.js exactly)
// ============================================

/** Quaternion type {x, y, z, w} */
interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/**
 * Normalize quaternion to unit length.
 */
function quatNormalize(q: Quat): Quat {
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (l < 1e-9) return { x: 0, y: 0, z: 0, w: 1 };
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/**
 * Create quaternion that rotates 'from' vector to 'to' vector.
 *
 * CRITICAL: This MUST match THREE.js's Quaternion.setFromUnitVectors() exactly
 * to ensure policy and renderer use the same base alignment.
 *
 * Algorithm from THREE.js source:
 * https://github.com/mrdoob/three.js/blob/dev/src/math/Quaternion.js
 */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  // Based on THREE.js setFromUnitVectors implementation
  let r = dot(from, to) + 1;

  if (r < Number.EPSILON) {
    // 'from' and 'to' are nearly opposite
    r = 0;

    if (Math.abs(from.x) > Math.abs(from.z)) {
      return quatNormalize({ x: -from.y, y: from.x, z: 0, w: r });
    } else {
      return quatNormalize({ x: 0, y: -from.z, z: from.y, w: r });
    }
  }

  // Normal case: cross product gives rotation axis, r gives scalar part
  const c = cross(from, to);
  return quatNormalize({ x: c.x, y: c.y, z: c.z, w: r });
}

/**
 * Apply quaternion rotation to vector.
 *
 * Formula: v' = q * v * q^(-1)
 * Optimized version that doesn't require conjugate computation.
 */
export function applyQuatToVec3(v: Vec3, q: Quat): Vec3 {
  // From THREE.js Vector3.applyQuaternion
  const vx = v.x, vy = v.y, vz = v.z;
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;

  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);

  // v + w * t + cross(q.xyz, t)
  return {
    x: vx + qw * tx + qy * tz - qz * ty,
    y: vy + qw * ty + qz * tx - qx * tz,
    z: vz + qw * tz + qx * ty - qy * tx,
  };
}

/**
 * Compute the base alignment quaternion for a bolt direction.
 *
 * This is the SINGLE SOURCE OF TRUTH for base alignment.
 * Both the policy (for twist calculation) and renderer (for mesh rotation)
 * MUST use this same quaternion to ensure fins align correctly.
 *
 * Maps MODEL_UP_AXIS (+Y) → boltDir using minimal rotation.
 *
 * @param boltDirUnit - Normalized bolt direction (A → C)
 * @returns Quaternion that aligns bolt model with target direction
 */
export function computeBaseQuat(boltDirUnit: Vec3): Quat {
  const modelUp = vec3(MODEL_UP_AXIS.x, MODEL_UP_AXIS.y, MODEL_UP_AXIS.z);
  const target = normalize(boltDirUnit);

  return quatFromUnitVectors(modelUp, target);
}

/**
 * Compute base-aligned reference direction for twist measurement.
 *
 * SINGLE SOURCE OF TRUTH FIX (v2.0):
 * This now uses computeBaseQuat() which matches THREE.js's setFromUnitVectors
 * exactly. This ensures the reference direction matches what the renderer
 * considers "fin-0" after base alignment.
 *
 * ALGORITHM:
 * 1. Compute baseQuat using computeBaseQuat() (matches renderer)
 * 2. Apply baseQuat to SPIN_REFERENCE_AXIS (+X = fin extension direction)
 * 3. Project result onto bolt's perpendicular plane
 *
 * @param boltDirUnit - Normalized bolt direction (A → C)
 * @returns Unit vector in the plane perpendicular to boltDir
 */
export function computeBaseAwareRefDir(boltDirUnit: Vec3): Vec3 {
  const axis = normalize(boltDirUnit);

  // Get the base alignment quaternion (same as renderer uses)
  const baseQuat = computeBaseQuat(axis);

  // Transform SPIN_REFERENCE_AXIS (+X) by baseQuat
  // This gives us where fin-0 points in world space after base alignment
  const spinRefModel = vec3(SPIN_REFERENCE_AXIS.x, SPIN_REFERENCE_AXIS.y, SPIN_REFERENCE_AXIS.z);
  const spinRefWorld = applyQuatToVec3(spinRefModel, baseQuat);

  // Project into bolt plane and normalize
  const refProjected = projectOntoPlane(spinRefWorld, axis);

  // Guard against degenerate case (shouldn't happen if SPIN_REFERENCE_AXIS ⊥ MODEL_UP)
  if (len(refProjected) < 1e-6) {
    // Fallback: pick any stable direction perpendicular to axis
    const fallbackWorld = Math.abs(axis.z) > 0.9 ? vec3(1, 0, 0) : vec3(0, 0, 1);
    return normalize(projectOntoPlane(fallbackWorld, axis));
  }

  return normalize(refProjected);
}

// ============================================
// SEAM DIRECTION DERIVATION
// ============================================

/**
 * Derive seam direction from corner type.
 *
 * LEGACY FALLBACK - Use deriveSeamDirFromPocket() for geometry-first approach.
 *
 * For cabinet corner joints, the seam (joint edge) typically runs
 * along the Z-axis (depth direction, front to back).
 *
 * This is a simplified derivation that works for standard 90° cabinets.
 * For angled panels, use explicit seamDirWorld from topology.
 *
 * @param cornerType - Corner position
 * @returns Seam direction vector (normalized)
 */
export function deriveSeamDirFromCorner(cornerType: CornerType): Vec3 {
  // For all corner joints, seam runs along Z (depth)
  // Sign doesn't matter for twist calculation (we use absolute angle)
  switch (cornerType) {
    case 'TOP_LEFT':
    case 'BOTTOM_LEFT':
      return vec3(0, 0, 1);  // +Z (front to back)
    case 'TOP_RIGHT':
    case 'BOTTOM_RIGHT':
      return vec3(0, 0, 1);  // +Z (same direction for symmetry)
    default:
      return vec3(0, 0, 1);  // fallback
  }
}

/**
 * Derive seam direction from actual geometry (GEOMETRY-FIRST approach).
 *
 * This computes the seam direction by projecting the pocket vector
 * onto the plane perpendicular to the bolt axis. The result is the
 * direction along the joint edge as seen from the bolt's perspective.
 *
 * ALGORITHM:
 * 1. pocketVec = targetPocketCenter - position (vector from bolt to cam)
 * 2. seamDir = projectOntoPlane(pocketVec, boltDir)
 * 3. If degenerate (pocketVec parallel to boltDir), return null
 *
 * WHY THIS WORKS:
 * - The bolt axis points toward the cam (A → C)
 * - The joint edge (seam) runs perpendicular to this axis
 * - By projecting pocketVec onto the bolt's perpendicular plane,
 *   we get the component that lies along the seam
 *
 * @param params - Position, target, and bolt direction
 * @returns Seam direction vector (normalized), or null if degenerate
 */
export function deriveSeamDirFromPocket(params: {
  position: Vec3;
  targetPocketCenter: Vec3;
  boltDir: Vec3;
}): Vec3 | null {
  const { position, targetPocketCenter, boltDir } = params;

  // Normalize bolt direction
  const axis = normalize(boltDir);

  // Vector from bolt position to cam pocket
  const pocketVec = sub(targetPocketCenter, position);

  // Project onto plane perpendicular to bolt axis
  const seamProjected = projectOntoPlane(pocketVec, axis);

  // Check for degenerate case (pocket vector parallel to bolt axis)
  if (len(seamProjected) < 1e-3) {
    return null; // Degenerate - let caller use fallback
  }

  return normalize(seamProjected);
}

/**
 * Derive seam direction from panel normal and bolt direction.
 *
 * PREFERRED METHOD: This computes the actual edge/seam direction using the
 * cross product of the panel normal and bolt direction.
 *
 * WHY THIS IS BETTER THAN deriveSeamDirFromPocket():
 * - The seam (joint edge) lies in the panel plane
 * - The seam is perpendicular to the bolt direction
 * - cross(normal, boltDir) gives exactly this direction
 *
 * GEOMETRY:
 * - normal: outward from panel surface (perpendicular to panel plane)
 * - boltDir: direction from bolt position to cam pocket (lies in panel plane)
 * - seam = cross(normal, boltDir): perpendicular to both, lies in panel plane
 *
 * @param params - Bolt direction and panel normal
 * @returns Seam direction vector (normalized), or null if degenerate
 */
export function deriveSeamDirFromNormal(params: {
  boltDir: Vec3;
  normal: Vec3;
}): Vec3 | null {
  const axis = normalize(params.boltDir);
  const n = normalize(params.normal);

  // seam = cross(normal, boltDir)
  // This gives the direction along the joint edge (perpendicular to bolt in panel plane)
  const seam = cross(n, axis);

  // Guard: if boltDir is parallel to normal, cross product is near zero
  if (len(seam) < 1e-6) {
    return null; // Degenerate - let caller use fallback
  }

  return normalize(seam);
}

/**
 * Compute signed angle between two vectors around an axis.
 * All vectors should be normalized and a, b should be perpendicular to axis.
 *
 * @param from - Start vector (normalized, in plane perpendicular to axis)
 * @param to - End vector (normalized, in plane perpendicular to axis)
 * @param axis - Rotation axis (normalized)
 * @returns Signed angle in radians (right-hand rule)
 */
function signedAngleAroundAxis(from: Vec3, to: Vec3, axis: Vec3): number {
  const crossFT = cross(from, to);
  const sin = dot(axis, crossFT);
  const cos = dot(from, to);
  return Math.atan2(sin, cos);
}

/**
 * Compute geometry-driven twist angle from seam direction.
 *
 * This is the core algorithm for seam-driven orientation:
 * 1. Project seam onto plane perpendicular to boltDir
 * 2. Compute desired direction based on joint mode:
 *    - INSET: align with seam (fins parallel to joint edge)
 *    - OVERLAY: perpendicular to seam (+90°)
 * 3. Compute twist angle from BASE-AWARE reference to desired direction
 *    (Reference is SPIN_REFERENCE_AXIS rotated by baseQuat that aligns MODEL_UP → boltDir)
 *
 * WHY BASE-AWARE REFERENCE:
 * - World-only reference causes constant offset (often 90°/180°) because
 *   "0° in world" ≠ "0° of bolt model after base alignment"
 * - Base-aware reference anchors 0° to the bolt model's spin axis, making
 *   fin orientation consistent regardless of bolt direction in world space
 *
 * @param params - Geometry parameters
 * @returns Twist angle in degrees (before handedness adjustment)
 */
export function computeSeamDrivenTwist(params: {
  /** Bolt direction (normalized, A → C) */
  boltDir: Vec3;
  /** Seam direction in world space (will be projected onto bolt plane) */
  seamDirWorld: Vec3;
  /** Joint mode: INSET aligns with seam, OVERLAY is +90° from seam */
  jointMode: JointMode;
  /** Optional policy offset in degrees */
  policyOffsetDeg?: number;
}): number {
  const { boltDir, seamDirWorld, jointMode, policyOffsetDeg = 0 } = params;

  const axis = normalize(boltDir);

  // 1. Project seam onto plane perpendicular to boltDir
  const seamProjected = projectOntoPlane(seamDirWorld, axis);

  // Guard: if seam is parallel to boltDir, use fallback
  // Check length BEFORE normalizing (normalize has its own fallback that would mask this)
  if (len(seamProjected) < 0.001) {
    // Degenerate case: seam parallel to bolt axis
    // Fall back to rule-based twist (0° for INSET, 90° for OVERLAY)
    return jointMode === 'OVERLAY' ? 90 + policyOffsetDeg : 0 + policyOffsetDeg;
  }

  const seamInPlane = normalize(seamProjected);

  // 2. Compute desired direction
  let desired: Vec3;
  if (jointMode === 'OVERLAY') {
    // OVERLAY: perpendicular to seam (rotate seam 90° around axis)
    // desired = axis × seam (right-hand rule gives +90°)
    desired = normalize(cross(axis, seamInPlane));
  } else {
    // INSET: align with seam
    desired = seamInPlane;
  }

  // 3. Base-aware reference direction (0° anchored to bolt model after base alignment)
  // This ensures fins align correctly regardless of bolt direction in world space
  const refDir = computeBaseAwareRefDir(axis);

  // 4. Compute signed angle from reference to desired
  const twistRad = signedAngleAroundAxis(refDir, desired, axis);
  let twistDeg = radToDeg(twistRad);

  // 5. Add policy offset
  twistDeg += policyOffsetDeg;

  // Normalize to [-180, 180)
  while (twistDeg >= 180) twistDeg -= 360;
  while (twistDeg < -180) twistDeg += 360;

  return twistDeg;
}

// ============================================
// HANDEDNESS
// ============================================

/**
 * Compute handedness sign for symmetric bolt appearance.
 *
 * For diagonal angles (45°, 135°), LEFT side bolts often need
 * the angle flipped to maintain visual symmetry.
 *
 * @param context - Orientation context
 * @param flipForLeftSide - Whether this rule should flip for left side
 * @returns +1 (no flip) or -1 (flip sign)
 */
export function getHandednessSign(
  context: BoltOrientationContext,
  flipForLeftSide: boolean = false
): number {
  if (!flipForLeftSide) return 1;
  if (context.panelSide === 'LEFT') return -1;
  return 1;
}

// ============================================
// DEFAULT RULES
// ============================================

/**
 * Default bolt orientation rules.
 * Order matters: first match wins.
 *
 * PRESET ANGLES:
 * - 0° = "horizontal" (bolt lies along panel surface)
 * - 90° = "vertical" (bolt perpendicular to panel surface)
 */
export const DEFAULT_BOLT_ORIENTATION_RULES: BoltOrientationRule[] = [
  // OVERLAY joints: bolt renders vertical (90°)
  {
    id: 'OVERLAY_90',
    description: 'Overlay joints: bolt perpendicular to panel (90°)',
    conditions: {
      jointMode: 'OVERLAY',
    },
    twistDeg: 90,
  },

  // INSET joints: bolt renders horizontal (0°)
  {
    id: 'INSET_0',
    description: 'Inset joints: bolt along panel surface (0°)',
    conditions: {
      jointMode: 'INSET',
    },
    twistDeg: 0,
  },

  // Fallback: default to horizontal (0°)
  {
    id: 'DEFAULT_0',
    description: 'Default fallback: horizontal (0°)',
    conditions: {},
    twistDeg: 0,
  },
];

// ============================================
// RULE MATCHING
// ============================================

/**
 * Check if a condition matches a value.
 * undefined condition = wildcard (matches anything)
 */
function matchesCondition<T>(
  condition: T | T[] | undefined,
  value: T | undefined
): boolean {
  // Wildcard: undefined condition matches anything
  if (condition === undefined) return true;

  // No value: only matches undefined condition (already handled above)
  if (value === undefined) return false;

  // Array condition: value must be in array
  if (Array.isArray(condition)) {
    return condition.includes(value);
  }

  // Single value condition
  return condition === value;
}

/**
 * Count how many non-wildcard conditions a rule has.
 * Higher specificity = more conditions defined = more specific rule.
 */
function computeSpecificity(rule: BoltOrientationRule): number {
  const { conditions } = rule;
  let score = 0;

  if (conditions.jointPosition !== undefined) score += 1;
  if (conditions.jointMode !== undefined) score += 1;
  if (conditions.panelSide !== undefined) score += 1;
  if (conditions.hardwareModel !== undefined) score += 1;

  return score;
}

/**
 * Check if all conditions of a rule match the context.
 */
function ruleMatches(
  rule: BoltOrientationRule,
  context: BoltOrientationContext
): boolean {
  const { conditions } = rule;

  return (
    matchesCondition(conditions.jointPosition, context.jointPosition) &&
    matchesCondition(conditions.jointMode, context.jointMode) &&
    matchesCondition(conditions.panelSide, context.panelSide) &&
    matchesCondition(conditions.hardwareModel, context.hardwareModel)
  );
}

/**
 * Sort rules by priority (desc) then specificity (desc).
 * Returns a new sorted array (does not mutate input).
 */
function sortRulesByPriorityAndSpecificity(
  rules: BoltOrientationRule[]
): BoltOrientationRule[] {
  return [...rules].sort((a, b) => {
    // Higher priority first
    const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
    if (priorityDiff !== 0) return priorityDiff;

    // Higher specificity first
    return computeSpecificity(b) - computeSpecificity(a);
  });
}

// ============================================
// RESOLVER
// ============================================

/**
 * Resolve bolt twist angle from context using rule list.
 *
 * Resolution order:
 * 1. Sort rules by priority (highest first)
 * 2. Among equal priority, prefer higher specificity
 * 3. First matching rule wins
 * 4. Apply handedness adjustment if rule specifies flipForLeftSide
 *
 * @param context - Bolt orientation context
 * @param rules - Rule list (default: DEFAULT_BOLT_ORIENTATION_RULES)
 * @returns Resolution result with twist angle and matched rule info
 *
 * @example
 * ```ts
 * const result = resolveBoltTwist({
 *   jointPosition: 'TOP',
 *   jointMode: 'OVERLAY',
 * });
 * // result.twistDeg = 90
 * // result.matchedRuleId = 'OVERLAY_90'
 * ```
 */
export function resolveBoltTwist(
  context: BoltOrientationContext,
  rules: BoltOrientationRule[] = DEFAULT_BOLT_ORIENTATION_RULES
): BoltOrientationResult {
  // Sort by priority and specificity
  const sortedRules = sortRulesByPriorityAndSpecificity(rules);

  for (const rule of sortedRules) {
    if (ruleMatches(rule, context)) {
      const specificity = computeSpecificity(rule);
      const handednessSign = getHandednessSign(context, rule.flipForLeftSide);
      const rawTwistDeg = rule.twistDeg;
      const twistDeg = rawTwistDeg * handednessSign;

      return {
        twistDeg,
        rawTwistDeg,
        handednessSign,
        matchedRuleId: rule.id,
        matchedRuleDescription: rule.description,
        specificity,
      };
    }
  }

  // Should never reach here if rules include a fallback
  // But just in case, return 0°
  return {
    twistDeg: 0,
    rawTwistDeg: 0,
    handednessSign: 1,
    matchedRuleId: 'NONE',
    matchedRuleDescription: 'No rule matched (fallback to 0°)',
    specificity: 0,
  };
}

// ============================================
// UTILITY: Degree to Radian
// ============================================

/**
 * Convert degrees to radians.
 */
export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Convert radians to degrees.
 */
export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

// ============================================
// CONVENIENCE PRESETS
// ============================================

/**
 * Quick lookup for common presets.
 * Use resolveBoltTwist() for full rule-based resolution.
 */
export const BOLT_TWIST_PRESETS = {
  HORIZONTAL: 0,
  VERTICAL: 90,
  DIAGONAL_45: 45,
  DIAGONAL_135: 135,
} as const;

// ============================================
// UNIFIED RESOLVER (v2.0)
// ============================================

/**
 * Result of geometry-driven orientation resolution.
 */
export interface SeamOrientationResult extends BoltOrientationResult {
  /** Whether geometry-driven calculation was used */
  usedGeometry: boolean;
  /** Seam direction used (if geometry-driven) */
  seamDir?: Vec3;
}

/**
 * Resolve bolt twist using geometry-first approach with rule fallback.
 *
 * RESOLUTION ORDER (v2.1 - True Geometry-First):
 * 1. If seamDirWorld is explicitly provided, use it
 * 2. If position + targetPocketCenter + boltDir are available, derive seam from pocket geometry
 * 3. If cornerType is provided, use legacy hardcoded derivation (fallback)
 * 4. Otherwise, fall back to rule-based resolution
 * 5. Apply handedness adjustment for LEFT side
 *
 * @param context - Extended context with geometry data
 * @param rules - Optional custom rules (for fallback)
 * @returns Resolution result with twist angle
 *
 * @example
 * ```ts
 * // Geometry-driven (recommended - uses actual pocket geometry)
 * const result = resolveSeamDrivenTwist({
 *   jointPosition: 'TOP',
 *   jointMode: 'OVERLAY',
 *   panelSide: 'LEFT',
 *   position: { x: 24, y: 700, z: 37 },
 *   targetPocketCenter: { x: 0, y: 693.75, z: 37 },
 *   boltDir: { x: -0.97, y: -0.26, z: 0 },
 * });
 *
 * // Falls back to rule-based if geometry not available
 * const result2 = resolveSeamDrivenTwist({
 *   jointPosition: 'TOP',
 *   jointMode: 'INSET',
 * });
 * ```
 */
export function resolveSeamDrivenTwist(
  context: SeamOrientationContext,
  rules: BoltOrientationRule[] = DEFAULT_BOLT_ORIENTATION_RULES
): SeamOrientationResult {
  // Try geometry-driven calculation first
  if (context.boltDir) {
    // Determine seam direction (priority order):
    // 1. Explicit seamDirWorld (user override)
    // 2. cross(normal, boltDir) - PREFERRED: gives actual edge direction
    // 3. Pocket geometry fallback
    // 4. Corner type fallback
    let seamDir: Vec3 | null | undefined;
    let seamSource: string = 'unknown';

    if (context.seamDirWorld) {
      // Priority 1: Explicit seam direction provided
      seamDir = context.seamDirWorld;
      seamSource = 'explicit';
    } else if (context.boltPanelNormal) {
      // Priority 2: Derive from panel normal + bolt direction (BEST METHOD)
      // seam = cross(normal, boltDir) gives the actual edge/joint direction
      seamDir = deriveSeamDirFromNormal({
        boltDir: context.boltDir,
        normal: context.boltPanelNormal,
      });
      seamSource = 'normal-cross';
    } else if (context.position && context.targetPocketCenter) {
      // Priority 3: Derive from pocket geometry (less reliable)
      seamDir = deriveSeamDirFromPocket({
        position: context.position,
        targetPocketCenter: context.targetPocketCenter,
        boltDir: context.boltDir,
      });
      seamSource = 'pocket-geometry';
    }

    // Priority 4: Fall back to cornerType derivation if geometry failed
    if (!seamDir && context.cornerType) {
      seamDir = deriveSeamDirFromCorner(context.cornerType);
      seamSource = 'corner-type';
    }

    if (seamDir) {
      // Use geometry-driven calculation
      const rawTwistDeg = computeSeamDrivenTwist({
        boltDir: context.boltDir,
        seamDirWorld: seamDir,
        jointMode: context.jointMode,
      });

      // Apply handedness flip for LEFT side (OVERLAY mode only)
      // OVERLAY: LEFT/RIGHT fins should mirror each other (visual symmetry)
      // INSET: LEFT/RIGHT fins should point SAME direction (both along seam)
      const shouldFlip = context.panelSide === 'LEFT' && context.jointMode === 'OVERLAY';
      const handednessSign = shouldFlip ? -1 : 1;
      const twistDeg = rawTwistDeg * handednessSign;

      return {
        twistDeg,
        rawTwistDeg,
        handednessSign,
        matchedRuleId: 'GEOMETRY_SEAM',
        matchedRuleDescription: `Seam-driven: ${context.jointMode} (${seamSource})`,
        specificity: 100, // High specificity for geometry-driven
        usedGeometry: true,
        seamDir,
      };
    }
  }

  // Fall back to rule-based resolution
  const ruleResult = resolveBoltTwist(context, rules);

  return {
    ...ruleResult,
    usedGeometry: false,
  };
}

// ============================================
// EXPORTS
// ============================================

export type { BoltOrientationRule as Rule };

// Export vector utilities for external use
export { vec3, normalize, projectOntoPlane, signedAngleAroundAxis };
