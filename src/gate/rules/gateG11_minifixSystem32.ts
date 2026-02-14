/**
 * Gate G11: Minifix/System32/Dowel Validation
 *
 * @module gate/rules/gateG11_minifixSystem32
 * @version 1.0.0
 *
 * Validates Minifix connector placement against Häfele engineering standards.
 * Based on the Canonical Engineering Specification (CANONICAL_SPEC.md).
 *
 * ## Rule Set
 * - G11.1: Distance B - measured from mate edge (LEFT/RIGHT), not FRONT
 * - G11.2: Dowel Depth - SIDE=18mm (EDGE_BORE), TOP/BOTTOM=12mm (FACE_BORE)
 * - G11.3: Drill Type - enforcement based on panel role
 * - G11.4: Mating Alignment - world-space dowel alignment ≤0.1mm
 *
 * ## Philosophy
 * "โรงงานก่อน ความสวยทีหลัง" (Factory first, aesthetics second)
 */

import type { Severity } from '../../spec';
import type { DrillMapPoint, DrillMap } from '../../core/manufacturing/drillMap/types';
import {
  G11_CONSTANTS,
  type G11Issue,
  type G11IssueCode,
  type G11Policy,
  type G11Result,
  type G11DrillPoint,
  type G11Panel,
  type G11Cabinet,
  type G11MatingPair,
  getExpectedBoreType,
  getExpectedDowelDepth,
  isSidePanel,
  isHorizontalPanel,
  calculateDistance,
  issueId,
  calculateBoltTipPosition,
  calculateCamPocketCenter,
} from './gateG11_types';

// ============================================
// DEFAULT POLICY
// ============================================

const DEFAULT_POLICY: Required<G11Policy> = {
  matingTolerance: G11_CONSTANTS.MATING_TOLERANCE,
  dimensionBTolerance: G11_CONSTANTS.DIMENSION_B_TOLERANCE,
  depthTolerance: G11_CONSTANTS.DEPTH_TOLERANCE,
  allowAlternateDistanceB: true,
  skipMatingCheck: [],
};

// ============================================
// G11.1: DISTANCE B VALIDATION
// ============================================

/**
 * G11.1: Validate Distance B is measured from mate edge.
 *
 * Distance B (24mm or 34mm) must be measured from the LEFT or RIGHT
 * edge of TOP/BOTTOM panels - NOT from the FRONT edge.
 *
 * @param drillPoints - CAM drill points on horizontal panels
 * @param policy - Validation policy
 * @returns Array of validation issues
 */
export function ruleG11_DistanceB(
  drillPoints: G11DrillPoint[],
  policy: G11Policy = {}
): G11Issue[] {
  const issues: G11Issue[] = [];
  const { dimensionBTolerance, allowAlternateDistanceB } = {
    ...DEFAULT_POLICY,
    ...policy,
  };

  // Filter CAM points on horizontal panels
  const camPoints = drillPoints.filter(
    p => (p.purpose === 'CAM_LOCK' || p.purpose === 'MINIFIX') &&
         isHorizontalPanel(p.connectedPanelRole || '')
  );

  for (const point of camPoints) {
    const edgeDistance = point.edgeDistance;
    if (edgeDistance === undefined) continue;

    // Check if Distance B matches standard (24mm) or alternate (34mm)
    const standardB = G11_CONSTANTS.DIMENSION_B_STANDARD;
    const alternateB = G11_CONSTANTS.DIMENSION_B_ALTERNATE;

    const deltaStandard = Math.abs(edgeDistance - standardB);
    const deltaAlternate = Math.abs(edgeDistance - alternateB);

    const matchesStandard = deltaStandard <= dimensionBTolerance;
    const matchesAlternate = allowAlternateDistanceB && deltaAlternate <= dimensionBTolerance;

    if (!matchesStandard && !matchesAlternate) {
      // Determine if it's a blocker or warning
      const minDelta = Math.min(deltaStandard, deltaAlternate);

      if (minDelta > dimensionBTolerance * 2) {
        // Severe deviation - likely wrong reference point (FRONT instead of mate edge)
        issues.push({
          id: issueId('B_G11_DISTANCE_B_WRONG_REFERENCE', point.id),
          severity: 'BLOCKER',
          code: 'B_G11_DISTANCE_B_WRONG_REFERENCE',
          message: `CAM at ${point.id}: Distance B (${edgeDistance.toFixed(1)}mm) appears to be measured from wrong reference. Expected ${standardB}mm from mate edge (LEFT/RIGHT).`,
          drillPointIds: [point.id],
          panelIds: [point.panelId],
          corner: point.cornerType,
          context: {
            measured: edgeDistance,
            expected: standardB,
            tolerance: dimensionBTolerance,
            mateEdge: point.cornerType?.includes('LEFT') ? 'LEFT' : 'RIGHT',
          },
        });
      } else {
        // Within recoverable range - warning
        issues.push({
          id: issueId('W_G11_DISTANCE_B_OUT_OF_TOLERANCE', point.id),
          severity: 'WARNING',
          code: 'W_G11_DISTANCE_B_OUT_OF_TOLERANCE',
          message: `CAM at ${point.id}: Distance B (${edgeDistance.toFixed(1)}mm) is ${minDelta.toFixed(1)}mm off from expected ${standardB}mm.`,
          drillPointIds: [point.id],
          panelIds: [point.panelId],
          context: {
            measured: edgeDistance,
            expected: standardB,
            tolerance: dimensionBTolerance,
          },
        });
      }
    }
  }

  return issues;
}

// ============================================
// G11.2: DOWEL DEPTH VALIDATION
// ============================================

/**
 * G11.2: Validate dowel depth according to Häfele standard.
 *
 * Split depth prevents wood bulge in 16-19mm panels:
 * - SIDE panel (EDGE_BORE): 18mm
 * - TOP/BOTTOM panel (FACE_BORE): 12mm
 * - Total: 30mm
 *
 * @param drillPoints - DOWEL drill points
 * @param panels - Panel information for role lookup
 * @param policy - Validation policy
 * @returns Array of validation issues
 */
export function ruleG11_DowelDepth(
  drillPoints: G11DrillPoint[],
  panels: G11Panel[] = [],
  policy: G11Policy = {}
): G11Issue[] {
  const issues: G11Issue[] = [];
  const { depthTolerance } = { ...DEFAULT_POLICY, ...policy };

  // Build panel role lookup
  const panelRoleMap = new Map(panels.map(p => [p.id, p.role]));

  // Filter DOWEL points
  const dowelPoints = drillPoints.filter(p => p.purpose === 'DOWEL');

  for (const point of dowelPoints) {
    // Determine panel role
    const panelRole = point.connectedPanelRole ||
                      panelRoleMap.get(point.panelId) ||
                      inferPanelRoleFromPoint(point);

    if (!panelRole) continue;

    const expectedDepth = getExpectedDowelDepth(panelRole);
    const actualDepth = point.depth;
    const delta = Math.abs(actualDepth - expectedDepth);

    if (delta > depthTolerance) {
      const isSide = isSidePanel(panelRole);
      const code: G11IssueCode = isSide
        ? 'B_G11_DOWEL_DEPTH_SIDE_WRONG'
        : 'B_G11_DOWEL_DEPTH_HORIZONTAL_WRONG';

      const boreType = isSide ? 'EDGE_BORE' : 'FACE_BORE';

      issues.push({
        id: issueId(code, point.id),
        severity: 'BLOCKER',
        code,
        message: `Dowel at ${point.id}: Depth ${actualDepth}mm should be ${expectedDepth}mm for ${panelRole} panel (${boreType}).`,
        drillPointIds: [point.id],
        panelIds: [point.panelId],
        context: {
          measured: actualDepth,
          expected: expectedDepth,
          tolerance: depthTolerance,
          panelRole,
          boreType,
        },
      });
    } else if (delta > 0.1) {
      // Within tolerance but not exact - info
      issues.push({
        id: issueId('W_G11_DOWEL_DEPTH_TOLERANCE', point.id),
        severity: 'WARNING',
        code: 'W_G11_DOWEL_DEPTH_TOLERANCE',
        message: `Dowel at ${point.id}: Depth ${actualDepth}mm is ${delta.toFixed(1)}mm off from optimal ${expectedDepth}mm.`,
        drillPointIds: [point.id],
        panelIds: [point.panelId],
        context: {
          measured: actualDepth,
          expected: expectedDepth,
          tolerance: depthTolerance,
          panelRole,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G11.3: DRILL TYPE ENFORCEMENT
// ============================================

/**
 * G11.3: Validate drill type matches panel role.
 *
 * Enforcement rules:
 * - SIDE panel: BOLT=EDGE_BORE, DOWEL=EDGE_BORE
 * - TOP/BOTTOM panel: CAM=FACE_BORE, DOWEL=FACE_BORE
 *
 * @param drillPoints - All drill points
 * @param panels - Panel information for role lookup
 * @returns Array of validation issues
 */
export function ruleG11_DrillType(
  drillPoints: G11DrillPoint[],
  panels: G11Panel[] = []
): G11Issue[] {
  const issues: G11Issue[] = [];

  // Build panel role lookup
  const panelRoleMap = new Map(panels.map(p => [p.id, p.role]));

  // Filter relevant drill points (BOLT, CAM, DOWEL)
  const relevantPurposes = ['BOLT', 'CAM_LOCK', 'MINIFIX', 'DOWEL'];
  const relevantPoints = drillPoints.filter(p => relevantPurposes.includes(p.purpose));

  for (const point of relevantPoints) {
    const panelRole = point.connectedPanelRole ||
                      panelRoleMap.get(point.panelId) ||
                      inferPanelRoleFromPoint(point);

    if (!panelRole) continue;

    // Infer actual bore type from drill normal and panel role (v4.0 context-aware)
    const actualBoreType = inferBoreTypeFromNormal(point.normal, panelRole);
    const expectedBoreType = getExpectedBoreType(panelRole, point.purpose);

    if (actualBoreType !== expectedBoreType) {
      const isSide = isSidePanel(panelRole);
      const code: G11IssueCode = isSide
        ? 'B_G11_DRILL_TYPE_SIDE_NOT_FACE'  // v4.0: SIDE must use FACE_BORE
        : 'B_G11_DRILL_TYPE_HORIZONTAL_NOT_FACE';

      issues.push({
        id: issueId(code, point.id),
        severity: 'BLOCKER',
        code,
        message: `Drill at ${point.id}: ${point.purpose} on ${panelRole} should be ${expectedBoreType}, but appears to be ${actualBoreType}.`,
        drillPointIds: [point.id],
        panelIds: [point.panelId],
        context: {
          panelRole,
          boreType: actualBoreType,
          expectedBoreType,
          purpose: point.purpose,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G11.4: MATING ALIGNMENT CHECK
// ============================================

/**
 * G11.4: Validate mating pair alignment.
 *
 * Matching dowel holes on SIDE and TOP/BOTTOM panels must align
 * within 0.1mm tolerance in world space.
 *
 * @param drillPoints - All drill points
 * @param policy - Validation policy
 * @returns Array of validation issues
 */
export function ruleG11_MatingAlignment(
  drillPoints: G11DrillPoint[],
  policy: G11Policy = {}
): G11Issue[] {
  const issues: G11Issue[] = [];
  const { matingTolerance, skipMatingCheck } = { ...DEFAULT_POLICY, ...policy };

  // Find mating pairs based on pairId
  const matingPairs = findMatingPairs(drillPoints);

  for (const pair of matingPairs) {
    // Skip if corner is in skip list
    if (skipMatingCheck?.includes(pair.corner)) continue;

    const distance = pair.distance;

    if (distance > matingTolerance) {
      issues.push({
        id: issueId('B_G11_MATING_MISALIGNMENT', pair.sidePoint.id, pair.horizontalPoint.id),
        severity: 'BLOCKER',
        code: 'B_G11_MATING_MISALIGNMENT',
        message: `Mating pair misalignment: SIDE dowel (${pair.sidePoint.id}) and horizontal dowel (${pair.horizontalPoint.id}) are ${distance.toFixed(2)}mm apart. Max allowed: ${matingTolerance}mm.`,
        drillPointIds: [pair.sidePoint.id, pair.horizontalPoint.id],
        corner: pair.corner,
        context: {
          measured: distance,
          tolerance: matingTolerance,
          sidePointId: pair.sidePoint.id,
          horizontalPointId: pair.horizontalPoint.id,
        },
      });
    } else if (distance > matingTolerance * 0.8) {
      // Near tolerance - warning
      issues.push({
        id: issueId('W_G11_MATING_NEAR_TOLERANCE', pair.sidePoint.id, pair.horizontalPoint.id),
        severity: 'WARNING',
        code: 'W_G11_MATING_NEAR_TOLERANCE',
        message: `Mating pair near tolerance: ${distance.toFixed(2)}mm (limit: ${matingTolerance}mm).`,
        drillPointIds: [pair.sidePoint.id, pair.horizontalPoint.id],
        corner: pair.corner,
        context: {
          measured: distance,
          tolerance: matingTolerance,
        },
      });
    }
  }

  return issues;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Infer panel role from drill point properties.
 */
function inferPanelRoleFromPoint(point: G11DrillPoint): string | undefined {
  // Use face property if available
  if (point.face) {
    switch (point.face) {
      case 'LEFT':
        return 'LEFT_SIDE';
      case 'RIGHT':
        return 'RIGHT_SIDE';
      case 'TOP':
        return 'TOP';
      case 'BOTTOM':
        return 'BOTTOM';
    }
  }

  // Use corner type if available
  if (point.cornerType) {
    if (point.cornerType.includes('LEFT')) {
      return point.purpose === 'BOLT' ? 'LEFT_SIDE' : undefined;
    }
    if (point.cornerType.includes('RIGHT')) {
      return point.purpose === 'BOLT' ? 'RIGHT_SIDE' : undefined;
    }
  }

  return undefined;
}

/**
 * Infer bore type from drill normal vector and panel role.
 *
 * v4.0 Side-covers-Top Construction:
 * - SIDE panels: horizontal normal [±X] = FACE_BORE (into inner face)
 * - SIDE panels: vertical normal [±Y] = EDGE_BORE (into top/bottom edge - WRONG in v4.0)
 * - HORIZ panels: vertical normal [±Y] = FACE_BORE (into face - for CAM)
 * - HORIZ panels: horizontal normal [±X] = EDGE_BORE (into left/right edge - for DOWEL)
 *
 * @param normal - Drill normal vector
 * @param panelRole - Optional panel role for context-aware inference
 */
function inferBoreTypeFromNormal(
  normal: [number, number, number],
  panelRole?: string
): 'EDGE_BORE' | 'FACE_BORE' {
  const [nx, ny, nz] = normal.map(Math.abs);
  const isHorizontalNormal = (nx > ny) || (nz > ny);

  // v4.0 context-aware inference
  if (panelRole && isSidePanel(panelRole)) {
    // SIDE panels: horizontal = FACE_BORE (v4.0), vertical = EDGE_BORE (wrong)
    return isHorizontalNormal ? 'FACE_BORE' : 'EDGE_BORE';
  }

  // HORIZ panels: horizontal = EDGE_BORE (for dowels), vertical = FACE_BORE (for CAM)
  return isHorizontalNormal ? 'EDGE_BORE' : 'FACE_BORE';
}

/**
 * Find mating pairs of dowel points.
 *
 * v4.0 Side-covers-Top: Pairs are identified by panel role:
 * - SIDE panel dowels pair with HORIZ panel dowels
 *
 * Pairs are identified by matching pairId patterns or by proximity.
 */
function findMatingPairs(drillPoints: G11DrillPoint[]): G11MatingPair[] {
  const pairs: G11MatingPair[] = [];

  // Filter dowel points
  const dowelPoints = drillPoints.filter(p => p.purpose === 'DOWEL');

  // v4.0: Separate by panel role (not bore type)
  const sidePoints = dowelPoints.filter(p =>
    isSidePanel(p.connectedPanelRole || '')
  );
  const horizPoints = dowelPoints.filter(p =>
    isHorizontalPanel(p.connectedPanelRole || '')
  );

  // Group by pairId base (remove -edge/-face/-side/-horiz suffix)
  const pairGroups = new Map<string, G11DrillPoint[]>();

  for (const point of dowelPoints) {
    if (!point.pairId) continue;

    // Extract base pairId (e.g., "pair-1-dowel" from "pair-1-dowel-side")
    const basePairId = point.pairId.replace(/-(?:edge|face|side|horiz)$/, '');
    const group = pairGroups.get(basePairId) || [];
    group.push(point);
    pairGroups.set(basePairId, group);
  }

  // Find matching pairs from pairId groups
  for (const [, points] of pairGroups) {
    if (points.length < 2) continue;

    // Find side and horizontal panel points
    const sidePoint = points.find(p =>
      isSidePanel(p.connectedPanelRole || '')
    );
    const horizPoint = points.find(p =>
      isHorizontalPanel(p.connectedPanelRole || '')
    );

    if (sidePoint && horizPoint) {
      const distance = calculateDistance(sidePoint.position, horizPoint.position);
      pairs.push({
        sidePoint,
        horizontalPoint: horizPoint,
        corner: sidePoint.cornerType || horizPoint.cornerType || 'UNKNOWN',
        distance,
      });
    }
  }

  // Also match by proximity for points without matching pairIds
  const matchedSide = new Set(pairs.map(p => p.sidePoint.id));
  const matchedHoriz = new Set(pairs.map(p => p.horizontalPoint.id));

  for (const sidePoint of sidePoints) {
    if (matchedSide.has(sidePoint.id)) continue;

    // Find closest unmatched horizontal point
    let closestHoriz: G11DrillPoint | null = null;
    let closestDistance = Infinity;

    for (const horizPoint of horizPoints) {
      if (matchedHoriz.has(horizPoint.id)) continue;

      const dist = calculateDistance(sidePoint.position, horizPoint.position);
      if (dist < closestDistance) {
        closestDistance = dist;
        closestHoriz = horizPoint;
      }
    }

    // Only pair if they're reasonably close (within 5mm)
    if (closestHoriz && closestDistance < 5) {
      pairs.push({
        sidePoint,
        horizontalPoint: closestHoriz,
        corner: sidePoint.cornerType || closestHoriz.cornerType || 'UNKNOWN',
        distance: closestDistance,
      });
      matchedSide.add(sidePoint.id);
      matchedHoriz.add(closestHoriz.id);
    }
  }

  return pairs;
}

// ============================================
// G11.5: BOLT TIP → CAM CENTER ALIGNMENT
// ============================================

/**
 * G11.5: Validate Bolt Tip aligns with CAM Pocket Center.
 *
 * CRITICAL FOR PHYSICAL ASSEMBLY:
 * The bolt's ball head must reach the CAM pocket center for proper engagement.
 *
 * Calculation:
 * - Bolt Tip = Entry Position + Protrusion × (-Normal)
 * - CAM Pocket = Surface Position + (camDepth/2) × Normal
 * - X-axis alignment: |BoltTip.X - CamCenter.X| ≤ 0.1mm
 *
 * @param drillPoints - All drill points (BOLT and CAM pairs)
 * @param policy - Validation policy
 * @returns Array of validation issues
 */
export function ruleG11_BoltCamAlignment(
  drillPoints: G11DrillPoint[],
  policy: G11Policy = {}
): G11Issue[] {
  const issues: G11Issue[] = [];
  const { matingTolerance = G11_CONSTANTS.MATING_TOLERANCE } = policy;

  // Find BOLT points
  const boltPoints = drillPoints.filter(p => p.purpose === 'BOLT');

  // Find CAM points
  const camPoints = drillPoints.filter(p =>
    p.purpose === 'CAM_LOCK' || p.purpose === 'MINIFIX'
  );

  for (const bolt of boltPoints) {
    // Find paired CAM point
    let cam: G11DrillPoint | undefined;

    // Try explicit pairedHoleId first
    if (bolt.pairedHoleId) {
      cam = camPoints.find(c => c.id === bolt.pairedHoleId);
    }

    // Fallback: match by pairId
    if (!cam && bolt.pairId) {
      const basePairId = bolt.pairId.replace(/-(?:bolt|cam|side|horiz)$/i, '');
      cam = camPoints.find(c => {
        if (!c.pairId) return false;
        const camBasePairId = c.pairId.replace(/-(?:bolt|cam|side|horiz)$/i, '');
        return camBasePairId === basePairId;
      });
    }

    // Fallback: match by corner type
    if (!cam && bolt.cornerType) {
      cam = camPoints.find(c => c.cornerType === bolt.cornerType);
    }

    if (!cam) continue;

    // Validate bolt and CAM are in the same corner
    if (bolt.cornerType && cam.cornerType && bolt.cornerType !== cam.cornerType) {
      issues.push({
        id: issueId('B_G11_BOLT_CAM_CORNER_MISMATCH', bolt.id, cam.id),
        severity: 'BLOCKER',
        code: 'B_G11_BOLT_CAM_CORNER_MISMATCH',
        message: `Bolt ${bolt.id} (${bolt.cornerType}) paired with CAM ${cam.id} (${cam.cornerType}) in different corners. Assembly will fail.`,
        drillPointIds: [bolt.id, cam.id],
        corner: bolt.cornerType,
        context: {
          boltCorner: bolt.cornerType,
          camCorner: cam.cornerType,
        },
      });
      continue;
    }

    // Calculate bolt tip position
    // Bolt protrusion extends OPPOSITE to drill normal direction
    const boltTip = calculateBoltTipPosition(
      bolt.position,
      bolt.normal,
      G11_CONSTANTS.BOLT_PROTRUSION_TOTAL // 24mm
    );

    // Calculate CAM pocket center
    // Default camDepth from Häfele spec for 18mm wood: 13.5mm (FF 3.10)
    const camDepth = cam.depth || 13.5;
    const camPocketCenter = calculateCamPocketCenter(
      cam.position,
      cam.normal,
      camDepth
    );

    // Check X-axis alignment (most critical for Side-covers-Top construction)
    const deltaX = Math.abs(boltTip[0] - camPocketCenter[0]);

    // Full 3D distance check
    const distance3D = calculateDistance(boltTip, camPocketCenter);

    if (deltaX > matingTolerance) {
      // BLOCKER: Bolt head won't reach CAM
      issues.push({
        id: issueId('B_G11_BOLT_CAM_MISALIGNMENT', bolt.id, cam.id),
        severity: 'BLOCKER',
        code: 'B_G11_BOLT_CAM_MISALIGNMENT',
        message: `Bolt tip at ${bolt.id} does not reach CAM center at ${cam.id}. X-axis gap: ${deltaX.toFixed(2)}mm (max: ${matingTolerance}mm). Bolt protrusion may be too short.`,
        drillPointIds: [bolt.id, cam.id],
        corner: bolt.cornerType,
        context: {
          boltTipX: boltTip[0],
          camCenterX: camPocketCenter[0],
          deltaX,
          distance3D,
          tolerance: matingTolerance,
          boltProtrusion: G11_CONSTANTS.BOLT_PROTRUSION_TOTAL,
          camDepth,
        },
      });
    } else if (deltaX > matingTolerance * 0.8) {
      // Warning: Near tolerance
      issues.push({
        id: issueId('W_G11_BOLT_CAM_NEAR_TOLERANCE', bolt.id, cam.id),
        severity: 'WARNING',
        code: 'W_G11_BOLT_CAM_NEAR_TOLERANCE',
        message: `Bolt-CAM alignment near tolerance: X-axis gap ${deltaX.toFixed(2)}mm (limit: ${matingTolerance}mm).`,
        drillPointIds: [bolt.id, cam.id],
        corner: bolt.cornerType,
        context: {
          boltTipX: boltTip[0],
          camCenterX: camPocketCenter[0],
          deltaX,
          tolerance: matingTolerance,
        },
      });
    }
  }

  return issues;
}

// ============================================
// MAIN GATE FUNCTION
// ============================================

/**
 * Run all G11 validation rules.
 *
 * @param drillPoints - All drill points to validate
 * @param panels - Panel information (optional)
 * @param policy - Validation policy (optional)
 * @returns G11 validation result
 */
export function runG11Rules(
  drillPoints: G11DrillPoint[],
  panels: G11Panel[] = [],
  policy: G11Policy = {}
): G11Result {
  const allIssues: G11Issue[] = [];

  // G11.1: Distance B
  allIssues.push(...ruleG11_DistanceB(drillPoints, policy));

  // G11.2: Dowel Depth
  allIssues.push(...ruleG11_DowelDepth(drillPoints, panels, policy));

  // G11.3: Drill Type
  allIssues.push(...ruleG11_DrillType(drillPoints, panels));

  // G11.4: Mating Alignment
  allIssues.push(...ruleG11_MatingAlignment(drillPoints, policy));

  // G11.5: Bolt Tip ↔ CAM Center Alignment
  allIssues.push(...ruleG11_BoltCamAlignment(drillPoints, policy));

  // Count by severity
  const blockers = allIssues.filter(i => i.severity === 'BLOCKER').length;
  const warnings = allIssues.filter(i => i.severity === 'WARNING').length;
  const info = allIssues.filter(i => i.severity === 'INFO').length;

  return {
    gate: 'G11_MINIFIX_SYSTEM32',
    status: blockers > 0 ? 'FAIL' : 'PASS',
    issues: allIssues,
    summary: {
      blockers,
      warnings,
      info,
      pairsValidated: findMatingPairs(drillPoints).length,
      pointsValidated: drillPoints.length,
    },
  };
}

/**
 * Validate G11 rules from a full DrillMap structure.
 *
 * Convenience wrapper that extracts drill points from nested DrillMap.
 *
 * @param drillMap - Full DrillMap structure
 * @param panels - Panel information (optional)
 * @param policy - Validation policy (optional)
 * @returns G11 validation result
 */
export function validateG11FromDrillMap(
  drillMap: DrillMap | null,
  panels: G11Panel[] = [],
  policy: G11Policy = {}
): G11Result {
  if (!drillMap) {
    return {
      gate: 'G11_MINIFIX_SYSTEM32',
      status: 'PASS',
      issues: [],
      summary: {
        blockers: 0,
        warnings: 0,
        info: 0,
        pairsValidated: 0,
        pointsValidated: 0,
      },
    };
  }

  // Flatten drill points from nested structure
  const allPoints: G11DrillPoint[] = [];

  for (const panel of drillMap.panels || []) {
    // DrillMapPanel uses single `points` array (not separated by type)
    if (!panel.points) continue;

    for (const point of panel.points) {
      allPoints.push({
        id: point.id,
        panelId: point.panelId,
        position: point.position,
        normal: point.normal,
        diameter: point.diameter,
        depth: point.depth,
        purpose: point.purpose,
        componentType: point.componentType,
        status: point.status ?? 'VALID',
        pairId: point.pairId,
        pairedHoleId: point.pairedHoleId,
        edgeDistance: point.edgeDistance,
        cornerType: point.cornerType,
        face: point.face,
        connectedPanelRole: point.connectedPanelRole,
      });
    }
  }

  return runG11Rules(allPoints, panels, policy);
}

// ============================================
// EXPORTS
// ============================================

export type {
  G11Issue,
  G11IssueCode,
  G11Policy,
  G11Result,
  G11DrillPoint,
  G11Panel,
  G11Cabinet,
  G11MatingPair,
};

export { G11_CONSTANTS };
