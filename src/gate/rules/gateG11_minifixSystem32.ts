/**
 * Gate G11: Minifix/System32/Dowel Validation
 *
 * @module gate/rules/gateG11_minifixSystem32
 * @version 1.1.0
 *
 * Validates Minifix connector placement against Häfele engineering standards.
 * Based on the Canonical Engineering Specification (CANONICAL_SPEC.md)
 * and Master Specification v1.1.
 *
 * ## Rule Set
 * - G11.1: Distance B - measured from mate edge (LEFT/RIGHT), not FRONT
 * - G11.2: Dowel Depth - SIDE=18mm (EDGE_BORE), TOP/BOTTOM=12mm (FACE_BORE)
 * - G11.3: Drill Type - enforcement based on panel role
 * - G11.4: Mating Alignment - world-space dowel alignment ≤0.1mm
 * - G11.5: Bolt Tip ↔ CAM Center Alignment
 * - G11.6: N-Center Policy & Mode Consistency (v1.1)
 * - G11.7: Double PVC Compensation Prevention (v1.1)
 * - G11.8: Edge Banding on Join Edge Forbidden (v1.1)
 *
 * ## Philosophy
 * "โรงงานก่อน ความสวยทีหลัง" (Factory first, aesthetics second)
 */

import type { Severity } from '../../spec';
import type { DrillMapPoint, DrillMap } from '../../core/manufacturing/drillMap/types';
import type { NCenterPolicy, ManufacturingMode, EdgeBandMap } from '../../core/connector/types';
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
  type G11PanelSpan,
  getExpectedBoreType,
  getExpectedDowelDepth,
  isSidePanel,
  isHorizontalPanel,
  calculateDistance,
  issueId,
  calculateBoltTipPosition,
  calculateCamPocketCenter,
  dominantAxisOf,
  thicknessAxisOf,
  thicknessAxisFromRole,
  panelSpanFromRole,
  isAxisAlignedRotation,
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
  const panelSpans = buildPanelSpanMap(panels);

  // Filter DOWEL points
  const dowelPoints = drillPoints.filter(p => p.purpose === 'DOWEL');

  for (const point of dowelPoints) {
    // Determine panel role
    const panelRole = point.connectedPanelRole ||
                      panelRoleMap.get(point.panelId) ||
                      inferPanelRoleFromPoint(point);

    if (!panelRole) continue;

    // Construction-aware (S16): ความลึกตามชนิดรูจริง ไม่ใช่ตามแผ่น —
    // EDGE_BORE (end grain) = 18mm, FACE_BORE = 12mm, รวม 30mm ทั้ง OVERLAY และ INSET
    // (เดิม hardcode ตาม role แบบ INSET v4.0 → ด่าตู้ OVERLAY ทุกใบทั้งที่ generator ถูก)
    // S19: ชนิดรูมาจากแกนความหนาของแผ่นจริง ไม่ใช่ "normal แนวนอน/แนวตั้ง" —
    // เดิมแยก Y ออกจาก {X,Z} ได้ แต่แยก X จาก Z ไม่ได้ → รูขอบหลัง (±Z) ของแผ่นข้าง
    // ถูกอ่านเป็น FACE_BORE แล้วด่างานที่ถูกต้อง
    const boreType = inferBoreTypeFromNormal(
      point.normal,
      panelRole,
      spanForPoint(point, panelSpans),
      point.panelThickness,
    );
    if (boreType === undefined) {
      // 12mm vs 18mm is decided entirely by which bore this is. Without that,
      // there is no expectation to compare against.
      issues.push(unknownBoreTypeIssue(point, panelRole, 'G11.2 dowel depth'));
      continue;
    }
    const expectedDepth = boreType === 'EDGE_BORE'
      ? G11_CONSTANTS.DOWEL_DEPTH_HORIZ_EDGE
      : G11_CONSTANTS.DOWEL_DEPTH_SIDE_FACE;
    const actualDepth = point.depth;
    const delta = Math.abs(actualDepth - expectedDepth);

    if (delta > depthTolerance) {
      const isSide = isSidePanel(panelRole);
      const code: G11IssueCode = isSide
        ? 'B_G11_DOWEL_DEPTH_SIDE_WRONG'
        : 'B_G11_DOWEL_DEPTH_HORIZONTAL_WRONG';

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
  const panelSpans = buildPanelSpanMap(panels);

  // Every purpose whose required bore type is fixed by the hardware itself.
  // BOLT_ENTRY and BOLT_THREAD were previously excluded and therefore never
  // checked at all — BOLT_ENTRY is exactly where the edge-bore expectation
  // lives, so leaving it out meant the only EDGE case went unexamined.
  for (const point of drillPoints) {
    const expectedBoreType = getExpectedBoreType(point.purpose);

    // DOWEL and anything else the hardware does not pin down: handled by the
    // pair check below, not by a per-point expectation.
    if (expectedBoreType === undefined) continue;

    const panelRole = point.connectedPanelRole ||
                      panelRoleMap.get(point.panelId) ||
                      inferPanelRoleFromPoint(point);

    if (!panelRole) continue;

    // Infer actual bore type from the panel's thickness axis (S19)
    const actualBoreType = inferBoreTypeFromNormal(
      point.normal,
      panelRole,
      spanForPoint(point, panelSpans),
      point.panelThickness,
    );

    if (actualBoreType === undefined) {
      issues.push(unknownBoreTypeIssue(point, panelRole, 'G11.3 drill type'));
      continue;
    }

    if (actualBoreType !== expectedBoreType) {
      // Keep the two long-standing codes for the "should have been a face
      // bore" cases they already name, and add one for the opposite direction
      // rather than filing an edge-bore failure under a *_NOT_FACE code.
      const code: G11IssueCode = expectedBoreType === 'EDGE_BORE'
        ? 'B_G11_DRILL_TYPE_NOT_EDGE'
        : isSidePanel(panelRole)
          ? 'B_G11_DRILL_TYPE_SIDE_NOT_FACE'
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

  // DOWEL pair consistency: คู่ dowel ต้องเป็น EDGE_BORE + FACE_BORE เสมอ
  // (ทั้งคู่ EDGE หรือทั้งคู่ FACE = ประกอบไม่ได้ ไม่ว่า construction ไหน)
  const dowelPairs = findMatingPairs(drillPoints);
  for (const pair of dowelPairs) {
    const sideRole = pair.sidePoint.connectedPanelRole || 'SIDE';
    const horizRole = pair.horizontalPoint.connectedPanelRole || 'TOP';
    const sideType = inferBoreTypeFromNormal(
      pair.sidePoint.normal,
      sideRole,
      spanForPoint(pair.sidePoint, panelSpans),
      pair.sidePoint.panelThickness,
    );
    const horizType = inferBoreTypeFromNormal(
      pair.horizontalPoint.normal,
      horizRole,
      spanForPoint(pair.horizontalPoint, panelSpans),
      pair.horizontalPoint.panelThickness,
    );

    if (sideType === undefined || horizType === undefined) {
      // One end unclassifiable means the EDGE+FACE invariant cannot be tested.
      // Without this guard `undefined === undefined` would read as "both bores
      // are the same type" and raise a blocker naming a bore type of undefined.
      const unknownEnd = sideType === undefined ? pair.sidePoint : pair.horizontalPoint;
      const unknownRole = sideType === undefined ? sideRole : horizRole;
      issues.push(unknownBoreTypeIssue(unknownEnd, unknownRole, 'G11.3 dowel pair'));
      continue;
    }

    if (sideType === horizType) {
      issues.push({
        id: issueId('B_G11_DRILL_TYPE_SIDE_NOT_FACE', pair.sidePoint.id, pair.horizontalPoint.id),
        severity: 'BLOCKER',
        code: 'B_G11_DRILL_TYPE_SIDE_NOT_FACE',
        message: `Dowel pair ${pair.sidePoint.id}↔${pair.horizontalPoint.id}: both bores are ${sideType} — a dowel joint needs one EDGE_BORE and one FACE_BORE.`,
        drillPointIds: [pair.sidePoint.id, pair.horizontalPoint.id],
        corner: pair.corner,
        context: {
          boreType: sideType,
          expectedBoreType: sideType === 'EDGE_BORE' ? 'FACE_BORE' : 'EDGE_BORE',
          purpose: 'DOWEL',
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

    // Construction-aware (S16): วัดเฉพาะระนาบตั้งฉากกับแกน dowel —
    // ระยะตามแกน (ความหนาแผ่น เช่น 19.6mm) เป็น geometry ปกติ ไม่ใช่ misalignment
    const axis = dominantAxis(pair.sidePoint.normal);
    const distance = perpendicularDistance(
      pair.sidePoint.position,
      pair.horizontalPoint.position,
      axis,
    );

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
 * แกนเด่นของ normal (0=X, 1=Y, 2=Z)
 */
function dominantAxis(normal: [number, number, number]): number {
  const abs = normal.map(Math.abs);
  let axis = 0;
  if (abs[1] > abs[axis]) axis = 1;
  if (abs[2] > abs[axis]) axis = 2;
  return axis;
}

/**
 * ระยะห่างเฉพาะระนาบตั้งฉากกับแกนที่กำหนด (ตัด component ตามแกนทิ้ง)
 */
function perpendicularDistance(
  a: [number, number, number],
  b: [number, number, number],
  axis: number,
): number {
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    if (i === axis) continue;
    sum += (a[i] - b[i]) ** 2;
  }
  return Math.sqrt(sum);
}

/**
 * Infer bore type by comparing the bore's axis to the panel's THICKNESS axis.
 *
 * A bore is a FACE bore when it runs along the axis the panel's thickness runs
 * along — it penetrates ~18mm of material and must stay shallow. A bore along
 * either other axis is an EDGE bore: it runs down the panel's length or width,
 * into hundreds of mm of material, and is drilled deeper on purpose.
 *
 * S16 derived this from the drill normal alone, splitting the Y axis from
 * {X, Z}. That fixed OVERLAY (whose side bores are ±Y) but left X and Z
 * indistinguishable, so a ±Z bore into a side panel's BACK EDGE was read as a
 * face bore and correct 18mm joinery was condemned. Which of X / Y / Z is the
 * thickness axis is a property of the panel, not of the normal, so the panel is
 * now asked directly.
 *
 * @param normal - Drill direction (into material)
 * @param panelRole - Panel role, used when spans are unavailable
 * @param panelSpan - World-space panel extents [X, Y, Z] in mm (authoritative)
 * @param panelThicknessMm - Declared panel thickness, disambiguates the span match
 */
function inferBoreTypeFromNormal(
  normal: [number, number, number],
  panelRole?: string,
  panelSpan?: G11PanelSpan,
  panelThicknessMm?: number,
): 'EDGE_BORE' | 'FACE_BORE' | undefined {
  const boreAxis = dominantAxisOf(normal);

  // Measured geometry wins when we have it.
  const measured = panelSpan ? thicknessAxisOf(panelSpan, panelThicknessMm) : undefined;
  const thicknessAxis = measured ?? (panelRole ? thicknessAxisFromRole(panelRole) : undefined);

  // Neither measured spans nor a role whose orientation is known. Refuse to
  // classify: this used to assume FACE_BORE, which silently applied the 12mm
  // face expectation to bores it had never established were face bores.
  if (thicknessAxis === undefined) return undefined;

  return boreAxis === thicknessAxis ? 'FACE_BORE' : 'EDGE_BORE';
}

/**
 * Report that a point's bore type could not be established, so the rule that
 * needed it declined to run.
 *
 * Silence here would be indistinguishable from a pass. The gate says out loud
 * which hole it could not judge and why.
 */
function unknownBoreTypeIssue(
  point: G11DrillPoint,
  panelRole: string,
  rule: string,
): G11Issue {
  return {
    id: issueId('W_G11_BORE_TYPE_UNKNOWN', point.id, rule),
    severity: 'WARNING',
    code: 'W_G11_BORE_TYPE_UNKNOWN',
    message:
      `${rule} could not run on ${point.id}: the thickness axis of panel ${point.panelId} ` +
      `(role ${panelRole || 'unknown'}) is not established, so a FACE bore cannot be told from an EDGE bore. ` +
      `NOT CHECKED — this is not a pass.`,
    drillPointIds: [point.id],
    panelIds: [point.panelId],
    context: {
      panelRole,
      rule,
      purpose: point.purpose,
    },
  };
}

/**
 * Look up the world-space spans recorded for a drill point's panel.
 */
function spanForPoint(
  point: G11DrillPoint,
  panelSpans: Map<string, G11PanelSpan>,
): G11PanelSpan | undefined {
  return panelSpans.get(point.panelId);
}

/**
 * Build a panelId → world span index from the supplied panels.
 */
function buildPanelSpanMap(panels: G11Panel[]): Map<string, G11PanelSpan> {
  const map = new Map<string, G11PanelSpan>();
  for (const p of panels) {
    // An explicit span is measured, so it survives rotation. A span derived
    // from the role convention does not: that convention assumes the panel is
    // axis-aligned, so a rotated panel gets no derived span at all.
    const span = p.spanMm
      ?? (p.computed?.realThickness !== undefined && isAxisAlignedRotation(p.rotation)
        ? panelSpanFromRole(p.role, p.finishWidth, p.finishHeight, p.computed.realThickness)
        : undefined);
    if (span) map.set(p.id, span);
  }
  return map;
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
// G11.6: N-CENTER POLICY MODE CONSISTENCY (v1.1)
// ============================================

/** Extended drill point with v1.1 metadata */
export interface G11DrillPointV11 extends G11DrillPoint {
  nCenterPolicy?: NCenterPolicy;
  mode?: ManufacturingMode;
  vCoordinate?: number;
}

/** Panel with edge banding info for G11.8 */
export interface G11PanelWithEdgeBanding extends G11Panel {
  edgeBanding?: EdgeBandMap;
}

/**
 * G11.6: Validate manufacturing mode matches N-center policy.
 *
 * FATAL if:
 * - FINISHED_CENTER base used with DRILL_ON_CORE mode
 * - CORE_CENTER base used with DRILL_ON_FINISHED mode
 *
 * @param drillPoints - Drill points with optional nCenterPolicy
 * @param globalMode - Global manufacturing mode
 * @param policy - Validation policy
 * @returns Array of validation issues
 *
 * @see Master Specification v1.1 §7 (G11:N_POLICY_MATCH_MODE)
 */
export function ruleG11_NCenterPolicyMode(
  drillPoints: G11DrillPointV11[],
  globalMode?: ManufacturingMode,
  policy: G11Policy = {},
): G11Issue[] {
  const issues: G11Issue[] = [];

  for (const point of drillPoints) {
    const ncPolicy = point.nCenterPolicy;
    if (!ncPolicy) continue;

    const mode = point.mode ?? globalMode;
    if (!mode) continue;

    const expectedMode: ManufacturingMode =
      ncPolicy.base === 'CORE_CENTER' ? 'DRILL_ON_CORE' : 'DRILL_ON_FINISHED';

    if (mode !== expectedMode) {
      issues.push({
        id: issueId('B_G11_N_POLICY_MODE_MISMATCH', point.id),
        severity: 'BLOCKER',
        code: 'B_G11_N_POLICY_MODE_MISMATCH',
        message: `Drill at ${point.id}: N-center policy base '${ncPolicy.base}' requires '${expectedMode}', but current mode is '${mode}'.`,
        drillPointIds: [point.id],
        panelIds: [point.panelId],
        context: {
          policyBase: ncPolicy.base,
          currentMode: mode,
          expectedMode,
          offsetMm: ncPolicy.offsetMm,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G11.7: DOUBLE PVC COMPENSATION PREVENTION (v1.1)
// ============================================

/**
 * G11.7: Prevent double PVC deduction in FINISHED mode.
 *
 * FATAL if V-coordinate looks like system32S minus PVC in DRILL_ON_FINISHED mode.
 * In FINISHED mode, CNC zero is at finished surface — no manual PVC adjustment needed.
 *
 * @param drillPoints - Drill points with V-coordinate
 * @param globalMode - Global manufacturing mode
 * @param system32S - Expected System 32 backset (default 37mm)
 * @param pvcThickness - PVC thickness (default 1.0mm)
 * @param policy - Validation policy
 * @returns Array of validation issues
 *
 * @see Master Specification v1.1 §7 (G11:DOUBLE_COMPENSATION)
 */
export function ruleG11_DoublePvcCompensation(
  drillPoints: G11DrillPointV11[],
  globalMode?: ManufacturingMode,
  system32S: number = 50,
  pvcThickness: number = 1.0,
  policy: G11Policy = {},
): G11Issue[] {
  const issues: G11Issue[] = [];

  for (const point of drillPoints) {
    const mode = point.mode ?? globalMode;
    if (mode !== 'DRILL_ON_FINISHED') continue;

    const vCoord = point.vCoordinate;
    if (vCoord === undefined) continue;

    const expectedV = system32S;
    const suspectV = system32S - pvcThickness;

    // V matches suspect (double-compensated) value but not expected
    if (Math.abs(vCoord - suspectV) < 0.1 && Math.abs(vCoord - expectedV) > 0.1) {
      issues.push({
        id: issueId('B_G11_DOUBLE_PVC_COMPENSATION', point.id),
        severity: 'BLOCKER',
        code: 'B_G11_DOUBLE_PVC_COMPENSATION',
        message: `Drill at ${point.id}: V=${vCoord}mm suggests double PVC compensation. In DRILL_ON_FINISHED mode, V should be ${expectedV}mm (no manual PVC adjustment).`,
        drillPointIds: [point.id],
        panelIds: [point.panelId],
        context: {
          measured: vCoord,
          expected: expectedV,
          pvcThickness,
        },
      });
    }
  }

  return issues;
}

// ============================================
// G11.8: EDGE BANDING ON JOIN EDGE FORBIDDEN (v1.1)
// ============================================

/**
 * G11.8: Prevent edge banding on join edges.
 *
 * FATAL if edge banding is applied to edges where panels mate:
 * - Horizontal panels (TOP/BOTTOM): LEFT/RIGHT edges are join edges
 * - Side panels (LEFT_SIDE/RIGHT_SIDE): TOP/BOTTOM edges are join edges
 *
 * Edge banding on join edges creates a gap (0.4-2.0mm) that prevents
 * flush wood-to-wood contact required for Minifix and dowel engagement.
 *
 * @param panels - Panels with edge banding information
 * @param policy - Validation policy
 * @returns Array of validation issues
 *
 * @see Master Specification v1.1 §7 (G11:EDGE_BAND_JOIN_FORBIDDEN)
 */
export function ruleG11_EdgeBandJoinForbidden(
  panels: G11PanelWithEdgeBanding[],
  policy: G11Policy = {},
): G11Issue[] {
  const issues: G11Issue[] = [];

  for (const panel of panels) {
    if (!panel.edgeBanding) continue;

    const role = panel.role;
    const isSide = isSidePanel(role);
    const isHoriz = isHorizontalPanel(role);

    if (!isSide && !isHoriz) continue;

    // Determine join edges based on panel role
    const joinEdges: Array<'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT'> = [];
    if (isHoriz) {
      joinEdges.push('LEFT', 'RIGHT');
    }
    if (isSide) {
      joinEdges.push('TOP', 'BOTTOM');
    }

    // Check which join edges have banding
    const banded = panel.edgeBanding.banded;
    const violating = joinEdges.filter(edge => banded[edge]);

    if (violating.length > 0) {
      issues.push({
        id: issueId('B_G11_EDGE_BAND_JOIN_FORBIDDEN', panel.id),
        severity: 'BLOCKER',
        code: 'B_G11_EDGE_BAND_JOIN_FORBIDDEN',
        message: `Panel ${panel.id} (${role}): Edge banding on join edge(s) [${violating.join(', ')}] prevents flush assembly. Join edges must be bare wood.`,
        panelIds: [panel.id],
        context: {
          panelRole: role,
          joinEdges: joinEdges.join(', '),
          violatingEdges: violating.join(', '),
          bandThkMm: panel.edgeBanding.bandThkMm,
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
 * Additional context for v1.1 rules.
 * Optional to maintain backward compatibility.
 */
export interface G11V11Context {
  /** Global manufacturing mode */
  mode?: ManufacturingMode;
  /** System 32 backset (default 37mm) */
  system32S?: number;
  /** PVC thickness from stack (default 1.0mm) */
  pvcThickness?: number;
}

/**
 * Run all G11 validation rules.
 *
 * @param drillPoints - All drill points to validate
 * @param panels - Panel information (optional)
 * @param policy - Validation policy (optional)
 * @param v11Context - Additional context for v1.1 rules (optional)
 * @returns G11 validation result
 */
export function runG11Rules(
  drillPoints: G11DrillPoint[],
  panels: G11Panel[] = [],
  policy: G11Policy = {},
  v11Context?: G11V11Context,
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

  // v1.1 Rules (only when context is provided)
  if (v11Context) {
    // G11.6: N-Center Policy & Mode Consistency
    if (v11Context.mode) {
      allIssues.push(...ruleG11_NCenterPolicyMode(
        drillPoints as G11DrillPointV11[],
        v11Context.mode,
        policy,
      ));
    }

    // G11.7: Double PVC Compensation Prevention
    if (v11Context.mode) {
      allIssues.push(...ruleG11_DoublePvcCompensation(
        drillPoints as G11DrillPointV11[],
        v11Context.mode,
        v11Context.system32S,
        v11Context.pvcThickness,
        policy,
      ));
    }

    // G11.8: Edge Banding on Join Edge Forbidden
    allIssues.push(...ruleG11_EdgeBandJoinForbidden(
      panels as G11PanelWithEdgeBanding[],
      policy,
    ));
  }

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

  // Panels carry the geometry that tells a FACE bore from an EDGE bore.
  // Callers rarely pass `panels` (the Safety tab passes none), so derive them
  // from the drill map itself — it already records role + finish size +
  // thickness for every panel it drilled. Without this the depth rules fall
  // back to the role convention and cannot see a rotated or unusual panel.
  const derivedPanels: G11Panel[] = [];

  for (const panel of drillMap.panels || []) {
    // DrillMapPanel uses single `points` array (not separated by type)
    if (!panel.points) continue;

    const thickness = panel.dimensions?.thickness;
    if (panel.dimensions && thickness !== undefined) {
      // No span for a role whose orientation is unknown, or for a rotated
      // panel: the rules then report the point as unclassifiable instead of
      // being handed a fabricated span to measure against.
      const spanMm = isAxisAlignedRotation(panel.worldRotation)
        ? panelSpanFromRole(
            panel.role,
            panel.dimensions.width,
            panel.dimensions.height,
            thickness,
          )
        : undefined;

      derivedPanels.push({
        id: panel.panelId,
        role: panel.role,
        position: panel.worldPosition ?? [0, 0, 0],
        rotation: panel.worldRotation ?? [0, 0, 0],
        finishWidth: panel.dimensions.width,
        finishHeight: panel.dimensions.height,
        computed: { realThickness: thickness },
        spanMm,
      });
    }

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
        pairId: point.pairId,
        pairedHoleId: point.pairedHoleId,
        edgeDistance: point.edgeDistance,
        cornerType: point.cornerType,
        face: point.face,
        connectedPanelRole: point.connectedPanelRole,
        panelThickness: point.panelThickness ?? thickness,
      });
    }
  }

  // Caller-supplied panels win; derived ones fill the gaps.
  const suppliedIds = new Set(panels.map(p => p.id));
  const effectivePanels = [
    ...panels,
    ...derivedPanels.filter(p => !suppliedIds.has(p.id)),
  ];

  return runG11Rules(allPoints, effectivePanels, policy);
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
