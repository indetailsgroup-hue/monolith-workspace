/**
 * flatPartGate.ts - FlatPart Gate Validation
 *
 * Validates FlatParts against Gate Rule Pack v1.
 * Gate failure blocks export.
 *
 * @version P14A.2
 */

import type { FlatPart, GateResult, GateIssue, GateSeverity } from './flatPartTypes.js';
import {
  GATE_RULE_IDS,
  MACHINE_LIMITS,
  SAFETY_MARGINS,
  TOLERANCE,
  SUGGESTED_FIXES,
  GATE_VERSION,
} from './flatPartGateRules.v1.js';

// ============================================================================
// Issue Builder
// ============================================================================

function issue(
  code: string,
  severity: GateSeverity,
  message: string,
  location?: string
): GateIssue {
  const suggestedFix = SUGGESTED_FIXES[code as keyof typeof SUGGESTED_FIXES];
  return {
    code,
    severity,
    message,
    location,
    suggestedFix,
  };
}

// ============================================================================
// Dimension Validation
// ============================================================================

function validateDimensions(part: FlatPart, issues: GateIssue[]): void {
  const { cutWidth, cutHeight, finishWidth, finishHeight, edges } = part;

  // Rule: CUT_SIZE_MIN
  if (cutWidth < MACHINE_LIMITS.MIN_CUT_SIZE) {
    issues.push(
      issue(
        GATE_RULE_IDS.CUT_SIZE_MIN,
        'ERROR',
        `Cut width ${cutWidth}mm below minimum ${MACHINE_LIMITS.MIN_CUT_SIZE}mm`,
        'cutWidth'
      )
    );
  }
  if (cutHeight < MACHINE_LIMITS.MIN_CUT_SIZE) {
    issues.push(
      issue(
        GATE_RULE_IDS.CUT_SIZE_MIN,
        'ERROR',
        `Cut height ${cutHeight}mm below minimum ${MACHINE_LIMITS.MIN_CUT_SIZE}mm`,
        'cutHeight'
      )
    );
  }

  // Rule: CUT_SIZE_MAX
  if (cutWidth > MACHINE_LIMITS.MAX_CUT_SIZE) {
    issues.push(
      issue(
        GATE_RULE_IDS.CUT_SIZE_MAX,
        'ERROR',
        `Cut width ${cutWidth}mm exceeds maximum ${MACHINE_LIMITS.MAX_CUT_SIZE}mm`,
        'cutWidth'
      )
    );
  }
  if (cutHeight > MACHINE_LIMITS.MAX_CUT_SIZE) {
    issues.push(
      issue(
        GATE_RULE_IDS.CUT_SIZE_MAX,
        'ERROR',
        `Cut height ${cutHeight}mm exceeds maximum ${MACHINE_LIMITS.MAX_CUT_SIZE}mm`,
        'cutHeight'
      )
    );
  }

  // Rule: CUT_SIZE_MISMATCH (if finish dimensions provided)
  if (finishWidth !== undefined && finishHeight !== undefined) {
    const leftEdge = edges.find((e) => e.side === 'left')?.thickness ?? 0;
    const rightEdge = edges.find((e) => e.side === 'right')?.thickness ?? 0;
    const topEdge = edges.find((e) => e.side === 'top')?.thickness ?? 0;
    const bottomEdge = edges.find((e) => e.side === 'bottom')?.thickness ?? 0;

    const expectedCutWidth = finishWidth - leftEdge - rightEdge;
    const expectedCutHeight = finishHeight - topEdge - bottomEdge;

    if (Math.abs(cutWidth - expectedCutWidth) > TOLERANCE.DIMENSION) {
      issues.push(
        issue(
          GATE_RULE_IDS.CUT_SIZE_MISMATCH,
          'WARN',
          `Cut width ${cutWidth}mm != expected ${expectedCutWidth}mm (finish ${finishWidth} - edges ${leftEdge}+${rightEdge})`,
          'cutWidth'
        )
      );
    }
    if (Math.abs(cutHeight - expectedCutHeight) > TOLERANCE.DIMENSION) {
      issues.push(
        issue(
          GATE_RULE_IDS.CUT_SIZE_MISMATCH,
          'WARN',
          `Cut height ${cutHeight}mm != expected ${expectedCutHeight}mm (finish ${finishHeight} - edges ${topEdge}+${bottomEdge})`,
          'cutHeight'
        )
      );
    }
  }
}

// ============================================================================
// Outer Contour Validation
// ============================================================================

function validateOuter(part: FlatPart, issues: GateIssue[]): void {
  const { outer, cutWidth, cutHeight } = part;

  // Rule: OUTER_INVALID
  if (outer.width <= 0 || outer.height <= 0) {
    issues.push(
      issue(
        GATE_RULE_IDS.OUTER_INVALID,
        'ERROR',
        `Invalid outer contour: ${outer.width}x${outer.height}mm`,
        'outer'
      )
    );
    return;
  }

  // Rule: OUTER_NOT_CLOSED (check contour matches cut size)
  if (
    Math.abs(outer.width - cutWidth) > TOLERANCE.DIMENSION ||
    Math.abs(outer.height - cutHeight) > TOLERANCE.DIMENSION
  ) {
    issues.push(
      issue(
        GATE_RULE_IDS.OUTER_NOT_CLOSED,
        'ERROR',
        `Outer contour ${outer.width}x${outer.height}mm does not match cut size ${cutWidth}x${cutHeight}mm`,
        'outer'
      )
    );
  }
}

// ============================================================================
// Drill Validation
// ============================================================================

function validateDrills(part: FlatPart, issues: GateIssue[]): void {
  const { drills, cutWidth, cutHeight, edges, composite } = part;
  const coreThickness = composite.core.thickness;
  const maxSafeDepth = coreThickness - SAFETY_MARGINS.DRILL_DEPTH_MARGIN;

  // Edge band sides
  const hasLeftBand = edges.some((e) => e.side === 'left');
  const hasRightBand = edges.some((e) => e.side === 'right');
  const hasTopBand = edges.some((e) => e.side === 'top');
  const hasBottomBand = edges.some((e) => e.side === 'bottom');

  for (const drill of drills) {
    const radius = drill.diameter / 2;

    // Rule: HOLE_DIAMETER_INVALID
    if (
      drill.diameter < MACHINE_LIMITS.MIN_DRILL_DIAMETER ||
      drill.diameter > MACHINE_LIMITS.MAX_DRILL_DIAMETER
    ) {
      issues.push(
        issue(
          GATE_RULE_IDS.HOLE_DIAMETER_INVALID,
          'ERROR',
          `Drill ${drill.id} diameter ${drill.diameter}mm outside range ${MACHINE_LIMITS.MIN_DRILL_DIAMETER}-${MACHINE_LIMITS.MAX_DRILL_DIAMETER}mm`,
          drill.id
        )
      );
    }

    // Rule: HOLE_TOO_DEEP
    if (!drill.isThrough && drill.depth > maxSafeDepth) {
      issues.push(
        issue(
          GATE_RULE_IDS.HOLE_TOO_DEEP,
          'ERROR',
          `Drill ${drill.id} depth ${drill.depth}mm exceeds safe ${maxSafeDepth}mm (core ${coreThickness}mm)`,
          drill.id
        )
      );
    }

    // Rule: HOLE_OUTSIDE_PART
    if (
      drill.x - radius < 0 ||
      drill.x + radius > cutWidth ||
      drill.y - radius < 0 ||
      drill.y + radius > cutHeight
    ) {
      issues.push(
        issue(
          GATE_RULE_IDS.HOLE_OUTSIDE_PART,
          'ERROR',
          `Drill ${drill.id} at (${drill.x}, ${drill.y}) extends outside part boundary`,
          drill.id
        )
      );
    }

    // Rule: HOLE_EDGE_CLEARANCE
    const minClearance = SAFETY_MARGINS.HOLE_TO_EDGE_BAND;

    if (hasLeftBand && drill.x - radius < minClearance) {
      issues.push(
        issue(
          GATE_RULE_IDS.HOLE_EDGE_CLEARANCE,
          'ERROR',
          `Drill ${drill.id} too close to left edge band (${(drill.x - radius).toFixed(1)}mm < ${minClearance}mm)`,
          drill.id
        )
      );
    }
    if (hasRightBand && cutWidth - drill.x - radius < minClearance) {
      issues.push(
        issue(
          GATE_RULE_IDS.HOLE_EDGE_CLEARANCE,
          'ERROR',
          `Drill ${drill.id} too close to right edge band (${(cutWidth - drill.x - radius).toFixed(1)}mm < ${minClearance}mm)`,
          drill.id
        )
      );
    }
    if (hasBottomBand && drill.y - radius < minClearance) {
      issues.push(
        issue(
          GATE_RULE_IDS.HOLE_EDGE_CLEARANCE,
          'ERROR',
          `Drill ${drill.id} too close to bottom edge band (${(drill.y - radius).toFixed(1)}mm < ${minClearance}mm)`,
          drill.id
        )
      );
    }
    if (hasTopBand && cutHeight - drill.y - radius < minClearance) {
      issues.push(
        issue(
          GATE_RULE_IDS.HOLE_EDGE_CLEARANCE,
          'ERROR',
          `Drill ${drill.id} too close to top edge band (${(cutHeight - drill.y - radius).toFixed(1)}mm < ${minClearance}mm)`,
          drill.id
        )
      );
    }
  }
}

// ============================================================================
// Pocket Validation
// ============================================================================

function validatePockets(part: FlatPart, issues: GateIssue[]): void {
  const { pockets, cutWidth, cutHeight, composite } = part;
  const coreThickness = composite.core.thickness;
  const maxSafeDepth = coreThickness - SAFETY_MARGINS.POCKET_DEPTH_MARGIN;

  for (const pocket of pockets) {
    const halfW = pocket.width / 2;
    const halfH = pocket.height / 2;

    // Rule: POCKET_SIZE_INVALID
    if (pocket.width < MACHINE_LIMITS.MIN_POCKET_SIZE || pocket.height < MACHINE_LIMITS.MIN_POCKET_SIZE) {
      issues.push(
        issue(
          GATE_RULE_IDS.POCKET_SIZE_INVALID,
          'ERROR',
          `Pocket ${pocket.id} size ${pocket.width}x${pocket.height}mm below minimum ${MACHINE_LIMITS.MIN_POCKET_SIZE}mm`,
          pocket.id
        )
      );
    }

    // Rule: POCKET_TOO_DEEP
    if (pocket.depth > maxSafeDepth) {
      issues.push(
        issue(
          GATE_RULE_IDS.POCKET_TOO_DEEP,
          'ERROR',
          `Pocket ${pocket.id} depth ${pocket.depth}mm exceeds safe ${maxSafeDepth}mm (core ${coreThickness}mm)`,
          pocket.id
        )
      );
    }

    // Rule: POCKET_OUTSIDE_PART
    if (
      pocket.x - halfW < 0 ||
      pocket.x + halfW > cutWidth ||
      pocket.y - halfH < 0 ||
      pocket.y + halfH > cutHeight
    ) {
      issues.push(
        issue(
          GATE_RULE_IDS.POCKET_OUTSIDE_PART,
          'ERROR',
          `Pocket ${pocket.id} at (${pocket.x}, ${pocket.y}) extends outside part boundary`,
          pocket.id
        )
      );
    }
  }
}

// ============================================================================
// Groove Validation
// ============================================================================

function validateGrooves(part: FlatPart, issues: GateIssue[]): void {
  const { grooves, cutWidth, cutHeight, composite } = part;
  const coreThickness = composite.core.thickness;
  const maxSafeDepth = coreThickness - SAFETY_MARGINS.GROOVE_DEPTH_MARGIN;

  for (const groove of grooves) {
    // Rule: GROOVE_WIDTH_INVALID
    if (
      groove.width < MACHINE_LIMITS.MIN_GROOVE_WIDTH ||
      groove.width > MACHINE_LIMITS.MAX_GROOVE_WIDTH
    ) {
      issues.push(
        issue(
          GATE_RULE_IDS.GROOVE_WIDTH_INVALID,
          'ERROR',
          `Groove ${groove.id} width ${groove.width}mm outside range ${MACHINE_LIMITS.MIN_GROOVE_WIDTH}-${MACHINE_LIMITS.MAX_GROOVE_WIDTH}mm`,
          groove.id
        )
      );
    }

    // Rule: GROOVE_TOO_DEEP
    if (groove.depth > maxSafeDepth) {
      issues.push(
        issue(
          GATE_RULE_IDS.GROOVE_TOO_DEEP,
          'ERROR',
          `Groove ${groove.id} depth ${groove.depth}mm exceeds safe ${maxSafeDepth}mm (core ${coreThickness}mm)`,
          groove.id
        )
      );
    }

    // Rule: GROOVE_OUTSIDE_PART
    const halfWidth = groove.width / 2;
    let outsidePart = false;

    if (groove.axis === 'x') {
      // Horizontal groove
      if (
        groove.position - halfWidth < 0 ||
        groove.position + halfWidth > cutHeight ||
        groove.start < 0 ||
        groove.start + groove.length > cutWidth
      ) {
        outsidePart = true;
      }
    } else {
      // Vertical groove
      if (
        groove.position - halfWidth < 0 ||
        groove.position + halfWidth > cutWidth ||
        groove.start < 0 ||
        groove.start + groove.length > cutHeight
      ) {
        outsidePart = true;
      }
    }

    if (outsidePart) {
      issues.push(
        issue(
          GATE_RULE_IDS.GROOVE_OUTSIDE_PART,
          'ERROR',
          `Groove ${groove.id} extends outside part boundary`,
          groove.id
        )
      );
    }
  }
}

// ============================================================================
// Material Validation
// ============================================================================

function validateMaterial(part: FlatPart, issues: GateIssue[]): void {
  const { composite } = part;

  // Rule: MATERIAL_MISSING
  if (!composite.core.materialName && !composite.core.materialCode) {
    issues.push(
      issue(GATE_RULE_IDS.MATERIAL_MISSING, 'ERROR', 'Core material is not specified', 'composite.core')
    );
  }
}

// ============================================================================
// Main Validation Function
// ============================================================================

/**
 * Validate a FlatPart against Gate Rule Pack v1
 *
 * @param part - FlatPart to validate
 * @returns Gate result with issues
 */
export function validateFlatPart(part: FlatPart): GateResult {
  const issues: GateIssue[] = [];

  // Run all validations
  validateDimensions(part, issues);
  validateOuter(part, issues);
  validateDrills(part, issues);
  validatePockets(part, issues);
  validateGrooves(part, issues);
  validateMaterial(part, issues);

  // Check for blocking errors
  const hasErrors = issues.some((i) => i.severity === 'ERROR');

  return {
    ok: !hasErrors,
    issues,
    canExport: !hasErrors,
    gateVersion: GATE_VERSION,
    validatedAt: new Date().toISOString(),
  };
}

/**
 * Validate multiple FlatParts
 *
 * @param parts - Array of FlatParts
 * @returns Combined gate result
 */
export function validateFlatParts(parts: FlatPart[]): GateResult {
  const allIssues: GateIssue[] = [];

  for (const part of parts) {
    const result = validateFlatPart(part);
    // Prefix issues with part identifier
    for (const issue of result.issues) {
      allIssues.push({
        ...issue,
        location: issue.location
          ? `${part.partNumber || part.id}:${issue.location}`
          : part.partNumber || part.id,
      });
    }
  }

  const hasErrors = allIssues.some((i) => i.severity === 'ERROR');

  return {
    ok: !hasErrors,
    issues: allIssues,
    canExport: !hasErrors,
    gateVersion: GATE_VERSION,
    validatedAt: new Date().toISOString(),
  };
}
