/**
 * Monolith Minifix Connector Validation
 *
 * Validates Minifix® Cam Lock connector assemblies against parametric constraints.
 * Ensures ball head is coaxial with cam pocket center for proper assembly.
 *
 * Coordinate System: Y-up (R3F/Three.js standard)
 * - Cabinets sit on XZ plane (floor)
 * - Y is vertical (height)
 *
 * Key constraints:
 * - MONO-MINIFIX-COAX-001: Ball center must be coaxial with cam pocket center (≤ 0.20mm radial)
 * - MONO-MINIFIX-Y-001: Ball center Y must match cam pocket center Y (≤ 0.20mm, Y-up)
 *
 * v1.0: Initial implementation
 * v1.1: Rebranded to Monolith naming convention
 */

import type {
  MinifixGateFinding,
  MinifixGateResult,
  MinifixConnectorPair,
  MinifixCamEntity,
  MinifixBoltEntity,
  Vec3,
  MinifixConstraintCode,
  ConstraintSeverity,
} from './minifixConstraintTypes';
import { MINIFIX_TOLERANCES, MINIFIX_CONSTRAINTS } from './minifixConstraintTypes';
import type { DrillMapPoint, DrillMap } from '../../../core/manufacturing/drillMap/types';
import { findMinifixPairs, buildConnectorPairFromDrillPoints, type MinifixSolveMode } from './drillMapToMinifixPair';
import {
  buildDrillMapIndex,
  patchPathForBoltY,
  patchPathForBoltPosition,
  buildValidationContext,
  flattenDrillMapPoints,
  type DrillMapIndex,
  type ValidationContext,
} from './drillMapIndex';

// ============================================
// VECTOR MATH UTILITIES
// ============================================

function vec3Subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function angleBetweenVectors(a: Vec3, b: Vec3): number {
  const normA = vec3Normalize(a);
  const normB = vec3Normalize(b);
  const dot = Math.max(-1, Math.min(1, vec3Dot(normA, normB)));
  return Math.acos(dot) * (180 / Math.PI); // degrees
}

/**
 * Calculate perpendicular distance from a point to a line (axis).
 * Used for coaxial check.
 */
function pointToLineDistance(point: Vec3, linePoint: Vec3, lineDir: Vec3): number {
  const v = vec3Subtract(point, linePoint);
  const lineNorm = vec3Normalize(lineDir);
  const cross = vec3Cross(v, lineNorm);
  return vec3Length(cross);
}

// ============================================
// CONSTRAINT VALIDATORS
// ============================================

/**
 * MONO-MINIFIX-AXIS-001: Cam axis must be normal to horizontal panel face
 */
function validateCamAxisNormal(
  cam: MinifixCamEntity,
  panelNormal: Vec3,
  findings: MinifixGateFinding[]
): void {
  const camAxisZ = cam.frame.axes.z;
  const angle = angleBetweenVectors(camAxisZ, panelNormal);

  // Check both directions (could be parallel or anti-parallel)
  const minAngle = Math.min(angle, 180 - angle);

  if (minAngle > MINIFIX_TOLERANCES.CAM_AXIS_NORMAL_DEG) {
    findings.push({
      severity: 'ERROR',
      code: 'MONO_MINIFIX_CAM_AXIS_NOT_NORMAL',
      entityIds: [cam.id],
      message: 'Cam axis is not perpendicular to horizontal panel face.',
      measured: { angle_deg: minAngle },
      tolerance: { angle_deg: MINIFIX_TOLERANCES.CAM_AXIS_NORMAL_DEG },
    });
  }
}

/**
 * MONO-MINIFIX-AXIS-002: Bolt axis must point toward cam pocket (radial entry)
 *
 * CRITICAL: Use (C - A) not (C - B) for direction check!
 * When B = C (BALL_TO_POCKET mode), (C - B) is zero vector.
 * The axis should point from edge drill origin (A) toward pocket center (C).
 */
function validateBoltAxisPointing(
  cam: MinifixCamEntity,
  bolt: MinifixBoltEntity,
  findings: MinifixGateFinding[]
): void {
  // ✅ Vector from bolt drill origin (A) to cam pocket center (C)
  // NOT from ball center (B) - because B may equal C in canonical mode
  const A = bolt.frame.origin;
  const C = cam.geometry.pocketCenter;
  const dirToCam = vec3Normalize(vec3Subtract(C, A));
  const boltAxis = vec3Normalize(bolt.frame.axis);

  // Check angle between bolt axis and direction to cam
  const angle = angleBetweenVectors(boltAxis, dirToCam);
  const minAngle = Math.min(angle, 180 - angle);

  if (minAngle > MINIFIX_TOLERANCES.BOLT_AXIS_POINTING_DEG) {
    findings.push({
      severity: 'ERROR',
      code: 'MONO_MINIFIX_BOLT_AXIS_NOT_POINTING',
      entityIds: [bolt.id, cam.id],
      message: 'Bolt axis does not point to cam pocket center (ball cannot enter pocket radially).',
      measured: { angle_deg: minAngle, axis_angle_to_C_A: angle },
      tolerance: { angle_deg: MINIFIX_TOLERANCES.BOLT_AXIS_POINTING_DEG },
    });
  }
}

/**
 * MONO-MINIFIX-COAX-001: Ball center must be coaxial with cam pocket center
 * This is the CRITICAL constraint for Minifix assembly.
 */
function validateCoaxial(
  cam: MinifixCamEntity,
  bolt: MinifixBoltEntity,
  findings: MinifixGateFinding[]
): void {
  // For coaxial check, we measure perpendicular distance from ball center to bolt axis
  // The ball center should lie on the line from bolt origin through cam center
  const boltAxis = vec3Normalize(bolt.frame.axis);
  const radialOffset = pointToLineDistance(
    cam.geometry.pocketCenter,
    bolt.geometry.ballCenter,
    boltAxis
  );

  if (radialOffset > MINIFIX_TOLERANCES.COAXIAL_RADIAL_MM) {
    const constraint = MINIFIX_CONSTRAINTS.find(c => c.id === 'MONO-MINIFIX-COAX-001')!;
    findings.push({
      severity: 'ERROR',
      code: 'MONO_MINIFIX_NOT_COAXIAL',
      entityIds: [cam.id, bolt.id],
      message: constraint.failure.message,
      measured: { radial_offset_mm: radialOffset },
      tolerance: { radial_mm: MINIFIX_TOLERANCES.COAXIAL_RADIAL_MM },
      suggestedFix: {
        strategy: constraint.fix?.strategy || 'MOVE_BOLT_ALONG_PANEL',
        patch: [
          {
            op: 'replace',
            path: `/entities/bolt/geometry/ball_center`,
            value: 'Align with cam.geometry.pocket_center on bolt axis',
          },
        ],
      },
    });
  }
}

/**
 * MONO-MINIFIX-Y-001: Ball center Y must match cam pocket center Y
 * Ensures shared height plane for proper engagement (Y-up coordinate system).
 */
function validateYMatch(
  cam: MinifixCamEntity,
  bolt: MinifixBoltEntity,
  findings: MinifixGateFinding[]
): void {
  // Y-up: Y is vertical (height), check height alignment
  const dy = Math.abs(bolt.geometry.ballCenter.y - cam.geometry.pocketCenter.y);

  if (dy > MINIFIX_TOLERANCES.Y_MISMATCH_MM) {
    const constraint = MINIFIX_CONSTRAINTS.find(c => c.id === 'MONO-MINIFIX-Y-001')!;
    findings.push({
      severity: 'ERROR',
      code: 'MONO_MINIFIX_Y_MISMATCH',
      entityIds: [cam.id, bolt.id],
      message: constraint.failure.message,
      measured: { delta_y_mm: dy },
      tolerance: { abs_mm: MINIFIX_TOLERANCES.Y_MISMATCH_MM },
      suggestedFix: {
        strategy: constraint.fix?.strategy || 'SET_BOLT_Y_FROM_CAM',
        patch: [
          {
            op: 'replace',
            path: '/entities/bolt/geometry/ball_center/y',
            value: cam.geometry.pocketCenter.y,
          },
        ],
      },
    });
  }
}

/**
 * MONO-MINIFIX-ORIENT-001: Cam arrow must face bolt direction
 *
 * CRITICAL: Use (A - C) not (B - C) for direction check!
 * When B = C (BALL_TO_POCKET mode), (B - C) is zero vector.
 * The arrow should face from pocket center (C) toward bolt origin (A).
 */
function validateCamArrowOrientation(
  cam: MinifixCamEntity,
  bolt: MinifixBoltEntity,
  findings: MinifixGateFinding[]
): void {
  // ✅ Direction from cam pocket center (C) to bolt drill origin (A)
  // NOT to ball center (B) - because B may equal C in canonical mode
  const A = bolt.frame.origin;
  const C = cam.geometry.pocketCenter;
  const dirToBolt = vec3Normalize(vec3Subtract(A, C));
  const arrowDir = vec3Normalize(cam.params.arrowDirection);

  const angle = angleBetweenVectors(arrowDir, dirToBolt);

  if (angle > MINIFIX_TOLERANCES.ARROW_DIRECTION_DEG) {
    findings.push({
      severity: 'ERROR',
      code: 'MONO_MINIFIX_ARROW_NOT_FACING_BOLT',
      entityIds: [cam.id, bolt.id],
      message: 'Cam arrow is not oriented toward bolt; tightening direction will be incorrect.',
      measured: { angle_deg: angle },
      tolerance: { angle_deg: MINIFIX_TOLERANCES.ARROW_DIRECTION_DEG },
    });
  }
}

/**
 * MONO-MINIFIX-CLEAR-001: Ball must be able to enter cam pocket without collision
 */
function validateClearance(
  cam: MinifixCamEntity,
  bolt: MinifixBoltEntity,
  findings: MinifixGateFinding[]
): void {
  const ballRadius = bolt.geometry.ballDiameter / 2;
  const pocketRadius = cam.geometry.housingDiameter / 2;

  // Check if ball can physically enter pocket
  const clearance = pocketRadius - ballRadius;

  if (clearance < MINIFIX_TOLERANCES.CLEARANCE_MIN_MM) {
    findings.push({
      severity: 'ERROR',
      code: 'MONO_MINIFIX_COLLISION_ON_ENTRY',
      entityIds: [cam.id, bolt.id],
      message: 'Ball collides with cam pocket boundary; entry is blocked.',
      measured: { clearance_mm: clearance },
      tolerance: { min_clearance_mm: MINIFIX_TOLERANCES.CLEARANCE_MIN_MM },
    });
  }
}

// ============================================
// MAIN VALIDATION FUNCTION
// ============================================

/**
 * Validate a single Minifix connector pair (cam + bolt).
 */
export function validateMinifixConnectorPair(pair: MinifixConnectorPair): MinifixGateFinding[] {
  const findings: MinifixGateFinding[] = [];

  const { cam, bolt, panelHorizontal } = pair;

  // MONO-MINIFIX-AXIS-001: Cam axis perpendicular to panel
  validateCamAxisNormal(cam, panelHorizontal.plane.normal, findings);

  // MONO-MINIFIX-AXIS-002: Bolt axis points to cam
  validateBoltAxisPointing(cam, bolt, findings);

  // MONO-MINIFIX-COAX-001: Coaxial alignment (CRITICAL)
  validateCoaxial(cam, bolt, findings);

  // MONO-MINIFIX-Y-001: Y-level match (CRITICAL, Y-up coordinate system)
  validateYMatch(cam, bolt, findings);

  // MONO-MINIFIX-ORIENT-001: Cam arrow orientation
  validateCamArrowOrientation(cam, bolt, findings);

  // MONO-MINIFIX-CLEAR-001: Entry clearance
  validateClearance(cam, bolt, findings);

  return findings;
}

/**
 * Validate all Minifix connectors in a job.
 * Main entry point for Gate integration.
 */
export function validateMinifixConnectors(pairs: MinifixConnectorPair[]): MinifixGateResult {
  const allFindings: MinifixGateFinding[] = [];

  for (const pair of pairs) {
    const pairFindings = validateMinifixConnectorPair(pair);
    allFindings.push(...pairFindings);
  }

  const errors = allFindings.filter(f => f.severity === 'ERROR').length;
  const warnings = allFindings.filter(f => f.severity === 'WARNING').length;

  return {
    gate: 'HARDWARE_CONNECTOR_VALIDATION',
    status: errors > 0 ? 'FAIL' : 'PASS',
    summary: { errors, warnings },
    findings: allFindings,
  };
}

// ============================================
// QUICK VALIDATION (For Live Feedback)
// ============================================

/**
 * Quick validation for live designer feedback.
 * Only checks the two critical constraints (coaxial + Y-match).
 * Uses Y-up coordinate system (Y is height).
 */
export function quickValidateMinifixAlignment(
  camCenter: Vec3,
  ballCenter: Vec3,
  boltAxis: Vec3
): { pass: boolean; radialOffset: number; yOffset: number } {
  // Y-match check (Y-up: Y is height)
  const yOffset = Math.abs(ballCenter.y - camCenter.y);

  // Coaxial check (perpendicular distance)
  const radialOffset = pointToLineDistance(camCenter, ballCenter, boltAxis);

  const pass =
    radialOffset <= MINIFIX_TOLERANCES.COAXIAL_RADIAL_MM &&
    yOffset <= MINIFIX_TOLERANCES.Y_MISMATCH_MM;

  return { pass, radialOffset, yOffset };
}

// ============================================
// DIAGNOSTIC PAYLOAD BUILDER
// ============================================

/**
 * Build a diagnostic payload for UI display and factory reporting.
 */
export function buildMinifixDiagnosticPayload(
  jobId: string,
  result: MinifixGateResult
): {
  job_id: string;
  gate: string;
  status: string;
  summary: { errors: number; warnings: number };
  findings: Array<{
    severity: string;
    code: string;
    entity_ids: string[];
    message: string;
    measured?: Record<string, number>;
    tolerance?: Record<string, number>;
    suggested_fix?: {
      strategy: string;
      patch?: Array<{ op: string; path: string; value?: unknown }>;
    };
  }>;
} {
  return {
    job_id: jobId,
    gate: 'HARDWARE_CONNECTOR_VALIDATION',
    status: result.status,
    summary: result.summary,
    findings: result.findings.map(f => ({
      severity: f.severity,
      code: f.code,
      entity_ids: f.entityIds,
      message: f.message,
      measured: f.measured,
      tolerance: f.tolerance,
      suggested_fix: f.suggestedFix
        ? {
            strategy: f.suggestedFix.strategy,
            patch: f.suggestedFix.patch?.map(p => ({
              op: p.op,
              path: p.path,
              value: p.value,
            })),
          }
        : undefined,
    })),
  };
}

// ============================================
// PAIR INTEGRITY VALIDATION (DrillMapPoint-based)
// ============================================

/**
 * Validate pair integrity for DrillMapPoints.
 * Checks MONO-MINIFIX-PAIR-001 and MONO-MINIFIX-PAIR-002 constraints.
 */
export function validatePairIntegrity(
  drillMapPoints: DrillMapPoint[]
): MinifixGateFinding[] {
  const findings: MinifixGateFinding[] = [];

  // Filter HOUSING points (cam) and BOLT points
  // CAM: componentType='HOUSING', purpose='CAM_LOCK' or 'MINIFIX'
  // BOLT: componentType='BOLT', purpose='BOLT' or 'MINIFIX' or 'CAM_LOCK'
  // (production uses 'BOLT', tests may use 'MINIFIX'/'CAM_LOCK' for uniformity)
  const housingPoints = drillMapPoints.filter(
    p => p.componentType === 'HOUSING' && (p.purpose === 'MINIFIX' || p.purpose === 'CAM_LOCK')
  );
  const boltPoints = drillMapPoints.filter(
    p => p.componentType === 'BOLT' && (p.purpose === 'MINIFIX' || p.purpose === 'CAM_LOCK' || p.purpose === 'BOLT')
  );
  const boltIdSet = new Set(boltPoints.map(b => b.id));

  // MONO-MINIFIX-PAIR-001: Check each cam has pairedHoleId
  for (const cam of housingPoints) {
    if (!cam.pairedHoleId) {
      findings.push({
        severity: 'ERROR',
        code: 'MONO_MINIFIX_MISSING_PAIRED_HOLE_ID',
        entityIds: [cam.id],
        message: 'Cam HOUSING drill point is missing pairedHoleId; cannot form deterministic cam↔bolt pair.',
      });
      continue;
    }

    // MONO-MINIFIX-PAIR-002: Check pairedHoleId resolves to bolt
    if (!boltIdSet.has(cam.pairedHoleId)) {
      findings.push({
        severity: 'ERROR',
        code: 'MONO_MINIFIX_PAIRED_HOLE_NOT_FOUND',
        entityIds: [cam.id],
        message: `pairedHoleId "${cam.pairedHoleId}" does not match any bolt DrillMapPoint.id.`,
      });
    }
  }

  return findings;
}

/**
 * Full Monolith Gate validation for Minifix connectors from DrillMap.
 * Validates both pair integrity and geometric constraints.
 *
 * @deprecated Use validateMinifixGate() which accepts nested DrillMap for deterministic patch paths
 * @param drillMapPoints - All DrillMapPoints (flattened)
 */
export function validateMinifixFromDrillMap(
  drillMapPoints: DrillMapPoint[],
  options?: {
    camDepth?: number;
    ballHeadOffset?: number;
    ballDiameter?: number;
    panelThickness?: number;
  }
): MinifixGateResult {
  const allFindings: MinifixGateFinding[] = [];
  const {
    camDepth = 13.5,          // 13.5mm for 18mm wood per Häfele FF 3.10
    ballHeadOffset = 9.5,
    ballDiameter = 7.0,
    panelThickness = 18,
  } = options || {};

  // 1) Pair integrity checks
  const integrityFindings = validatePairIntegrity(drillMapPoints);
  allFindings.push(...integrityFindings);

  // 2) Find cam-bolt pairs using deterministic pairedHoleId matching
  const drillPairs = findMinifixPairs(drillMapPoints);

  // 3) Validate each pair geometrically
  for (const { cam, bolt } of drillPairs) {
    const pair = buildConnectorPairFromDrillPoints({
      camPoint: cam,
      boltPoint: bolt,
      camDepth,
      boltBallOffset: ballHeadOffset,
      boltBallDiameter: ballDiameter,
      panelHThickness: panelThickness,
      panelVThickness: panelThickness,
    });

    const pairFindings = validateMinifixConnectorPair(pair);
    allFindings.push(...pairFindings);
  }

  const errors = allFindings.filter(f => f.severity === 'ERROR').length;
  const warnings = allFindings.filter(f => f.severity === 'WARNING').length;

  return {
    gate: 'HARDWARE_CONNECTOR_VALIDATION',
    status: errors > 0 ? 'FAIL' : 'PASS',
    summary: { errors, warnings },
    findings: allFindings,
  };
}

// ============================================
// MAIN GATE ENTRY POINT (Recommended)
// ============================================

export interface MinifixGateOptions {
  camDepth?: number;
  ballHeadOffset?: number;
  ballDiameter?: number;
  panelThickness?: number;
  /** Include suggestedFix with deterministic patch paths */
  includeSuggestedFix?: boolean;
  /**
   * Ball center solve mode (default: BALL_TO_POCKET).
   * BALL_TO_POCKET: Force B=C (production mode, errors auto-corrected)
   * FIXED_BALL_OFFSET: B = A + axis * offset (test mode for error detection)
   * AUTO: Use BALL_TO_POCKET if boltDirection set, else FIXED_BALL_OFFSET
   */
  solveMode?: MinifixSolveMode;
}

/**
 * Main Monolith Gate validation entry point for Minifix connectors.
 *
 * Accepts nested DrillMap structure to enable deterministic patch path generation.
 * Uses Index Resolver pattern for O(1) lookups.
 *
 * @param drillMap - The nested DrillMap from useDrillMapStore
 * @param options - Validation options
 * @returns Gate result with findings and deterministic patch paths
 *
 * @example
 * const drillMap = useDrillMapStore.getState().drillMap;
 * const result = validateMinifixGate(drillMap);
 * if (result.status === 'FAIL') {
 *   // Handle failures, apply patches if available
 * }
 */
export function validateMinifixGate(
  drillMap: DrillMap | null,
  options?: MinifixGateOptions
): MinifixGateResult {
  // Early return for null/empty drillMap
  if (!drillMap || !drillMap.panels?.length) {
    return {
      gate: 'HARDWARE_CONNECTOR_VALIDATION',
      status: 'PASS',
      summary: { errors: 0, warnings: 0 },
      findings: [],
    };
  }

  const {
    camDepth = 13.5,          // 13.5mm for 18mm wood per Häfele FF 3.10
    ballHeadOffset = 9.5,
    ballDiameter = 7.0,
    panelThickness = 18,
    includeSuggestedFix = true,
    solveMode, // undefined = use default (BALL_TO_POCKET)
  } = options || {};

  // Build validation context with index
  const ctx = buildValidationContext(drillMap);
  if (!ctx) {
    return {
      gate: 'HARDWARE_CONNECTOR_VALIDATION',
      status: 'PASS',
      summary: { errors: 0, warnings: 0 },
      findings: [],
    };
  }

  const allFindings: MinifixGateFinding[] = [];

  // 1) Pair integrity checks
  const integrityFindings = validatePairIntegrity(ctx.pointsFlat);
  allFindings.push(...integrityFindings);

  // 2) Find cam-bolt pairs using deterministic pairedHoleId matching
  const drillPairs = findMinifixPairs(ctx.pointsFlat);

  // DEBUG: Log pair count for diagnosis
  console.log(`[Minifix Gate] Found ${drillPairs.length} cam-bolt pairs to validate`);

  // 3) Validate each pair geometrically with index-aware patch paths
  for (let pairIndex = 0; pairIndex < drillPairs.length; pairIndex++) {
    const { cam, bolt } = drillPairs[pairIndex];
    const pair = buildConnectorPairFromDrillPoints({
      camPoint: cam,
      boltPoint: bolt,
      camDepth,
      boltBallOffset: ballHeadOffset,
      boltBallDiameter: ballDiameter,
      panelHThickness: panelThickness,
      panelVThickness: panelThickness,
      solveMode,
    });

    // DEBUG: Log first 3 pairs' geometry for diagnosis
    if (pairIndex < 3) {
      const C = pair.cam.geometry.pocketCenter;
      const B = pair.bolt.geometry.ballCenter;
      const boltAxis = pair.bolt.frame.axis;
      console.log(`[Minifix Pair ${pairIndex}] cam=${cam.id} bolt=${bolt.id}`);
      console.log(`  camDrillPos: [${cam.position.join(', ')}] normal: [${cam.normal.join(', ')}]`);
      console.log(`  boltDrillPos: [${bolt.position.join(', ')}] normal: [${bolt.normal.join(', ')}]`);
      console.log(`  boltDirection: [${bolt.boltDirection?.join(', ') ?? 'N/A'}]`);
      console.log(`  computed camPocketCenter: (${C.x.toFixed(2)}, ${C.y.toFixed(2)}, ${C.z.toFixed(2)})`);
      console.log(`  computed ballCenter:      (${B.x.toFixed(2)}, ${B.y.toFixed(2)}, ${B.z.toFixed(2)})`);
      console.log(`  computed boltAxis:        (${boltAxis.x.toFixed(3)}, ${boltAxis.y.toFixed(3)}, ${boltAxis.z.toFixed(3)})`);
    }

    // Validate and enhance findings with deterministic patch paths
    const pairFindings = validateMinifixConnectorPair(pair);

    // Enhance findings with deterministic patch paths if enabled
    if (includeSuggestedFix) {
      for (const finding of pairFindings) {
        enhanceFindingWithDeterministicPatch(finding, ctx.index, cam, bolt, pair);
      }
    }

    allFindings.push(...pairFindings);
  }

  const errors = allFindings.filter(f => f.severity === 'ERROR').length;
  const warnings = allFindings.filter(f => f.severity === 'WARNING').length;

  return {
    gate: 'HARDWARE_CONNECTOR_VALIDATION',
    status: errors > 0 ? 'FAIL' : 'PASS',
    summary: { errors, warnings },
    findings: allFindings,
  };
}

/**
 * Enhance a finding with deterministic patch paths using the index.
 */
function enhanceFindingWithDeterministicPatch(
  finding: MinifixGateFinding,
  index: DrillMapIndex,
  camPoint: DrillMapPoint,
  boltPoint: DrillMapPoint,
  pair: MinifixConnectorPair
): void {
  // Skip if no suggestedFix strategy
  if (!finding.suggestedFix?.strategy) return;

  const { strategy } = finding.suggestedFix;

  switch (strategy) {
    case 'SET_BOLT_Y_FROM_CAM': {
      // Y mismatch fix: set bolt position Y to cam pocket center Y
      const patchPath = patchPathForBoltY(index, boltPoint.id);
      if (patchPath) {
        finding.suggestedFix.patch = [
          {
            op: 'replace',
            path: patchPath,
            value: pair.cam.geometry.pocketCenter.y,
          },
        ];
      }
      break;
    }

    case 'MOVE_BOLT_ALONG_PANEL': {
      // Coaxial fix: move bolt position to align with cam center
      const patchPath = patchPathForBoltPosition(index, boltPoint.id);
      if (patchPath) {
        // Calculate aligned position (project cam center onto bolt axis plane)
        const alignedX = pair.cam.geometry.pocketCenter.x;
        const alignedZ = pair.cam.geometry.pocketCenter.z;
        finding.suggestedFix.patch = [
          {
            op: 'replace',
            path: patchPath,
            value: [alignedX, boltPoint.position[1], alignedZ],
          },
        ];
      }
      break;
    }

    default:
      // No deterministic patch available for this strategy
      break;
  }
}
