/**
 * flatPartGate.ts - P14A.2 Gate Rule Pack v1
 *
 * Manufacturing validation rules for FlatPart.
 * These rules block spec.freeze AND manufacturing.exportDXF.
 *
 * CORE RULES (v1):
 * 1. DXF_OUTER_NOT_CLOSED - Outer contour must form closed rectangle
 * 2. CUT_SIZE_INVALID - Cut dimensions must be positive and within machine limits
 * 3. HOLE_TOO_DEEP_FOR_CORE - Drill depth cannot exceed core thickness
 * 4. HOLE_TOO_CLOSE_TO_EDGE_BAND - Holes must clear edge banding zone
 *
 * @version 0.14.2
 */

import type {
  FlatPart,
  FlatPartIssue,
  FlatPartIssueCode,
  FlatPartIssueSeverity,
  FlatPartValidationResult,
  DrillFeature,
} from '../types/FlatPart';

// ============================================================================
// Configuration
// ============================================================================

export interface GateConfig {
  /** Minimum cut dimension (mm) */
  minCutSize: number;
  /** Maximum cut dimension (mm) - machine bed limit */
  maxCutSize: number;
  /** Minimum distance from hole center to banded edge (mm) */
  minHoleToEdgeBand: number;
  /** Safety margin for drill depth vs core thickness (mm) */
  drillDepthSafetyMargin: number;
  /** Minimum pocket depth before warning (mm) */
  minPocketDepthWarn: number;
}

export const DEFAULT_GATE_CONFIG: GateConfig = {
  minCutSize: 50,           // 50mm minimum panel dimension
  maxCutSize: 2800,         // 2800mm max (typical CNC bed)
  minHoleToEdgeBand: 8,     // 8mm from edge band to hole center
  drillDepthSafetyMargin: 2, // 2mm safety margin
  minPocketDepthWarn: 3,    // Warn if pocket < 3mm deep
};

// ============================================================================
// Issue Factory
// ============================================================================

function createIssue(
  code: FlatPartIssueCode,
  severity: FlatPartIssueSeverity,
  message: string,
  location?: string,
  suggestedFix?: string
): FlatPartIssue {
  return { code, severity, message, location, suggestedFix };
}

// ============================================================================
// Rule 1: DXF_OUTER_NOT_CLOSED
// ============================================================================

function checkOuterContour(part: FlatPart): FlatPartIssue[] {
  const issues: FlatPartIssue[] = [];

  // For rectangle contours, check dimensions are valid
  if (part.outer.type === 'rectangle') {
    if (part.outer.width <= 0 || part.outer.height <= 0) {
      issues.push(
        createIssue(
          'DXF_OUTER_NOT_CLOSED',
          'ERROR',
          `Outer contour has invalid dimensions: ${part.outer.width}×${part.outer.height}mm`,
          'outer',
          'cmd:adjust_panel_dimensions'
        )
      );
    }

    // Check width and height match cut dimensions
    if (Math.abs(part.outer.width - part.cutWidth) > 0.01) {
      issues.push(
        createIssue(
          'DXF_OUTER_NOT_CLOSED',
          'ERROR',
          `Outer contour width (${part.outer.width}) doesn't match cut width (${part.cutWidth})`,
          'outer',
          'cmd:recalculate_cut_size'
        )
      );
    }

    if (Math.abs(part.outer.height - part.cutHeight) > 0.01) {
      issues.push(
        createIssue(
          'DXF_OUTER_NOT_CLOSED',
          'ERROR',
          `Outer contour height (${part.outer.height}) doesn't match cut height (${part.cutHeight})`,
          'outer',
          'cmd:recalculate_cut_size'
        )
      );
    }
  }

  return issues;
}

// ============================================================================
// Rule 2: CUT_SIZE_INVALID
// ============================================================================

function checkCutSize(part: FlatPart, config: GateConfig): FlatPartIssue[] {
  const issues: FlatPartIssue[] = [];

  // Check minimum size
  if (part.cutWidth < config.minCutSize) {
    issues.push(
      createIssue(
        'CUT_SIZE_INVALID',
        'ERROR',
        `Cut width ${part.cutWidth}mm is below minimum ${config.minCutSize}mm`,
        'cutWidth',
        'cmd:increase_panel_width'
      )
    );
  }

  if (part.cutHeight < config.minCutSize) {
    issues.push(
      createIssue(
        'CUT_SIZE_INVALID',
        'ERROR',
        `Cut height ${part.cutHeight}mm is below minimum ${config.minCutSize}mm`,
        'cutHeight',
        'cmd:increase_panel_height'
      )
    );
  }

  // Check maximum size
  if (part.cutWidth > config.maxCutSize) {
    issues.push(
      createIssue(
        'CUT_SIZE_INVALID',
        'ERROR',
        `Cut width ${part.cutWidth}mm exceeds machine limit ${config.maxCutSize}mm`,
        'cutWidth',
        'cmd:reduce_panel_width'
      )
    );
  }

  if (part.cutHeight > config.maxCutSize) {
    issues.push(
      createIssue(
        'CUT_SIZE_INVALID',
        'ERROR',
        `Cut height ${part.cutHeight}mm exceeds machine limit ${config.maxCutSize}mm`,
        'cutHeight',
        'cmd:reduce_panel_height'
      )
    );
  }

  // Check finish vs cut relationship
  if (part.cutWidth > part.finishWidth) {
    issues.push(
      createIssue(
        'CUT_SIZE_INVALID',
        'WARN',
        `Cut width ${part.cutWidth}mm exceeds finish width ${part.finishWidth}mm (pre-mill too aggressive?)`,
        'cutWidth',
        'cmd:adjust_premill'
      )
    );
  }

  if (part.cutHeight > part.finishHeight) {
    issues.push(
      createIssue(
        'CUT_SIZE_INVALID',
        'WARN',
        `Cut height ${part.cutHeight}mm exceeds finish height ${part.finishHeight}mm (pre-mill too aggressive?)`,
        'cutHeight',
        'cmd:adjust_premill'
      )
    );
  }

  return issues;
}

// ============================================================================
// Rule 3: HOLE_TOO_DEEP_FOR_CORE
// ============================================================================

function checkHoleDepth(part: FlatPart, config: GateConfig): FlatPartIssue[] {
  const issues: FlatPartIssue[] = [];
  const coreThickness = part.composite.core.thickness;
  const maxSafeDepth = coreThickness - config.drillDepthSafetyMargin;

  for (const drill of part.drills) {
    if (drill.isThrough) {
      // Through holes are OK
      continue;
    }

    if (drill.depth > maxSafeDepth) {
      issues.push(
        createIssue(
          'HOLE_TOO_DEEP_FOR_CORE',
          'ERROR',
          `Drill ${drill.id} depth ${drill.depth}mm exceeds safe depth ${maxSafeDepth}mm (core: ${coreThickness}mm)`,
          drill.id,
          'cmd:reduce_drill_depth'
        )
      );
    }

    // Check if drill would penetrate through with surface materials
    const totalThickness = part.composite.totalThickness;
    if (drill.depth >= totalThickness) {
      issues.push(
        createIssue(
          'HOLE_TOO_DEEP_FOR_CORE',
          'ERROR',
          `Drill ${drill.id} depth ${drill.depth}mm would penetrate total thickness ${totalThickness}mm`,
          drill.id,
          'cmd:convert_to_through_hole'
        )
      );
    }
  }

  // Check pockets too
  for (const pocket of part.pockets) {
    if (pocket.depth > maxSafeDepth) {
      issues.push(
        createIssue(
          'POCKET_EXCEEDS_THICKNESS',
          'ERROR',
          `Pocket ${pocket.id} depth ${pocket.depth}mm exceeds safe depth ${maxSafeDepth}mm`,
          pocket.id,
          'cmd:reduce_pocket_depth'
        )
      );
    }
  }

  // Check grooves
  for (const groove of part.grooves) {
    if (groove.depth > maxSafeDepth) {
      issues.push(
        createIssue(
          'GROOVE_EXCEEDS_THICKNESS',
          'ERROR',
          `Groove ${groove.id} depth ${groove.depth}mm exceeds safe depth ${maxSafeDepth}mm`,
          groove.id,
          'cmd:reduce_groove_depth'
        )
      );
    }
  }

  return issues;
}

// ============================================================================
// Rule 4: HOLE_TOO_CLOSE_TO_EDGE_BAND
// ============================================================================

function checkHoleEdgeClearance(part: FlatPart, config: GateConfig): FlatPartIssue[] {
  const issues: FlatPartIssue[] = [];
  const minClearance = config.minHoleToEdgeBand;

  // Build edge band zones
  const hasTopBand = part.edges.some((e) => e.side === 'top');
  const hasBottomBand = part.edges.some((e) => e.side === 'bottom');
  const hasLeftBand = part.edges.some((e) => e.side === 'left');
  const hasRightBand = part.edges.some((e) => e.side === 'right');

  for (const drill of part.drills) {
    const { x, y, diameter, id } = drill;
    const radius = diameter / 2;

    // Check left edge
    if (hasLeftBand && x - radius < minClearance) {
      issues.push(
        createIssue(
          'HOLE_TOO_CLOSE_TO_EDGE_BAND',
          'ERROR',
          `Drill ${id} is ${(x - radius).toFixed(1)}mm from left edge band (min: ${minClearance}mm)`,
          id,
          'cmd:move_hole_from_edge'
        )
      );
    }

    // Check right edge
    if (hasRightBand && part.cutWidth - x - radius < minClearance) {
      issues.push(
        createIssue(
          'HOLE_TOO_CLOSE_TO_EDGE_BAND',
          'ERROR',
          `Drill ${id} is ${(part.cutWidth - x - radius).toFixed(1)}mm from right edge band (min: ${minClearance}mm)`,
          id,
          'cmd:move_hole_from_edge'
        )
      );
    }

    // Check bottom edge
    if (hasBottomBand && y - radius < minClearance) {
      issues.push(
        createIssue(
          'HOLE_TOO_CLOSE_TO_EDGE_BAND',
          'ERROR',
          `Drill ${id} is ${(y - radius).toFixed(1)}mm from bottom edge band (min: ${minClearance}mm)`,
          id,
          'cmd:move_hole_from_edge'
        )
      );
    }

    // Check top edge
    if (hasTopBand && part.cutHeight - y - radius < minClearance) {
      issues.push(
        createIssue(
          'HOLE_TOO_CLOSE_TO_EDGE_BAND',
          'ERROR',
          `Drill ${id} is ${(part.cutHeight - y - radius).toFixed(1)}mm from top edge band (min: ${minClearance}mm)`,
          id,
          'cmd:move_hole_from_edge'
        )
      );
    }
  }

  return issues;
}

// ============================================================================
// Additional Checks
// ============================================================================

function checkFeaturesWithinBounds(part: FlatPart): FlatPartIssue[] {
  const issues: FlatPartIssue[] = [];
  const { cutWidth, cutHeight } = part;

  // Check drills
  for (const drill of part.drills) {
    const radius = drill.diameter / 2;

    if (drill.x - radius < 0 || drill.x + radius > cutWidth) {
      issues.push(
        createIssue(
          'FEATURE_OUTSIDE_BOUNDARY',
          'ERROR',
          `Drill ${drill.id} extends outside panel width boundary`,
          drill.id,
          'cmd:move_hole_inside'
        )
      );
    }

    if (drill.y - radius < 0 || drill.y + radius > cutHeight) {
      issues.push(
        createIssue(
          'FEATURE_OUTSIDE_BOUNDARY',
          'ERROR',
          `Drill ${drill.id} extends outside panel height boundary`,
          drill.id,
          'cmd:move_hole_inside'
        )
      );
    }
  }

  // Check pockets
  for (const pocket of part.pockets) {
    const halfW = pocket.width / 2;
    const halfH = pocket.height / 2;

    if (pocket.x - halfW < 0 || pocket.x + halfW > cutWidth) {
      issues.push(
        createIssue(
          'FEATURE_OUTSIDE_BOUNDARY',
          'ERROR',
          `Pocket ${pocket.id} extends outside panel width boundary`,
          pocket.id,
          'cmd:move_pocket_inside'
        )
      );
    }

    if (pocket.y - halfH < 0 || pocket.y + halfH > cutHeight) {
      issues.push(
        createIssue(
          'FEATURE_OUTSIDE_BOUNDARY',
          'ERROR',
          `Pocket ${pocket.id} extends outside panel height boundary`,
          pocket.id,
          'cmd:move_pocket_inside'
        )
      );
    }
  }

  return issues;
}

// ============================================================================
// Main Validation
// ============================================================================

/**
 * Validate a FlatPart against all gate rules.
 *
 * @param part - The FlatPart to validate
 * @param config - Gate configuration (optional)
 * @returns Validation result with issues
 */
export function validateFlatPart(
  part: FlatPart,
  config: GateConfig = DEFAULT_GATE_CONFIG
): FlatPartValidationResult {
  const issues: FlatPartIssue[] = [];

  // Run all rules
  issues.push(...checkOuterContour(part));
  issues.push(...checkCutSize(part, config));
  issues.push(...checkHoleDepth(part, config));
  issues.push(...checkHoleEdgeClearance(part, config));
  issues.push(...checkFeaturesWithinBounds(part));

  // Determine overall status
  const hasErrors = issues.some((i) => i.severity === 'ERROR');
  const hasWarnings = issues.some((i) => i.severity === 'WARN');

  return {
    ok: !hasErrors,
    issues,
    canExport: !hasErrors,
    canFreeze: !hasErrors,
  };
}

/**
 * Validate multiple FlatParts.
 */
export function validateFlatParts(
  parts: FlatPart[],
  config: GateConfig = DEFAULT_GATE_CONFIG
): Map<string, FlatPartValidationResult> {
  const results = new Map<string, FlatPartValidationResult>();

  for (const part of parts) {
    results.set(part.id, validateFlatPart(part, config));
  }

  return results;
}

/**
 * Check if all FlatParts pass validation (can export).
 */
export function canExportFlatParts(parts: FlatPart[], config?: GateConfig): boolean {
  for (const part of parts) {
    const result = validateFlatPart(part, config);
    if (!result.canExport) {
      return false;
    }
  }
  return true;
}
