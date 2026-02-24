/**
 * Drawer Rules - Drawer Configuration Validation
 *
 * Validates drawer dimensions, slide compatibility,
 * and row stacking constraints.
 *
 * v1.0: Initial drawer rules
 */

import type { DesignerIntent, DesignerIssue, DesignerRule } from '../types';
import { DRAWER_LIMITS, DIMENSION_LIMITS } from '../policy';
import { createRule, blocker, warning, info } from './ruleRegistry';

// ============================================
// DRAWER SIZE RULES
// ============================================

/**
 * Rule: Drawer front height range.
 */
export const DRAWER_FRONT_HEIGHT_RULE = createRule(
  'DRAWER_FRONT_HEIGHT',
  'Drawer front height must be within valid range',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    if (!drawers?.enabled || drawers.rows.length === 0) {
      return [];
    }

    const issues: DesignerIssue[] = [];

    for (let i = 0; i < drawers.rows.length; i++) {
      const row = drawers.rows[i];

      if (row.frontHeight < DRAWER_LIMITS.minFrontHeight) {
        issues.push(
          blocker(
            'DRAWER_FRONT_TOO_SHORT',
            `Drawer row ${i + 1} front height ${row.frontHeight}mm is below minimum ${DRAWER_LIMITS.minFrontHeight}mm`,
            `drawers.rows.${i}.frontHeight`,
            `Increase front height to at least ${DRAWER_LIMITS.minFrontHeight}mm`
          )
        );
      }

      if (row.frontHeight > DRAWER_LIMITS.maxFrontHeight) {
        issues.push(
          warning(
            'DRAWER_FRONT_VERY_TALL',
            `Drawer row ${i + 1} front height ${row.frontHeight}mm exceeds typical maximum ${DRAWER_LIMITS.maxFrontHeight}mm`,
            `drawers.rows.${i}.frontHeight`,
            'Consider splitting into multiple drawers or verify this is intentional'
          )
        );
      }
    }

    return issues;
  }
);

/**
 * Rule: Drawer gap validation.
 */
export const DRAWER_GAP_RULE = createRule(
  'DRAWER_GAP',
  'Gap between drawers must be within valid range',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    if (!drawers?.enabled || drawers.rows.length === 0) {
      return [];
    }

    const issues: DesignerIssue[] = [];

    for (let i = 0; i < drawers.rows.length; i++) {
      const row = drawers.rows[i];

      if (row.gapAbove < DRAWER_LIMITS.minGapAbove) {
        issues.push(
          blocker(
            'DRAWER_GAP_TOO_SMALL',
            `Drawer row ${i + 1} gap ${row.gapAbove}mm is below minimum ${DRAWER_LIMITS.minGapAbove}mm`,
            `drawers.rows.${i}.gapAbove`,
            `Increase gap to at least ${DRAWER_LIMITS.minGapAbove}mm for proper clearance`
          )
        );
      }

      if (row.gapAbove > DRAWER_LIMITS.maxGapAbove) {
        issues.push(
          info(
            'DRAWER_GAP_LARGE',
            `Drawer row ${i + 1} gap ${row.gapAbove}mm is larger than typical (${DRAWER_LIMITS.maxGapAbove}mm)`,
            `drawers.rows.${i}.gapAbove`,
            'Large gaps may affect aesthetics. Typical gap is 3-5mm.'
          )
        );
      }
    }

    return issues;
  }
);

// ============================================
// DRAWER COUNT RULES
// ============================================

/**
 * Rule: Maximum drawer row count.
 */
export const DRAWER_COUNT_RULE = createRule(
  'DRAWER_COUNT',
  'Number of drawer rows must not exceed maximum',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    if (!drawers?.enabled) {
      return [];
    }

    if (drawers.rows.length > DRAWER_LIMITS.maxRows) {
      return [
        blocker(
          'TOO_MANY_DRAWERS',
          `${drawers.rows.length} drawer rows exceeds maximum ${DRAWER_LIMITS.maxRows}`,
          'drawers.rows',
          `Reduce to ${DRAWER_LIMITS.maxRows} or fewer drawer rows`
        ),
      ];
    }

    return [];
  }
);

// ============================================
// DRAWER FIT RULES
// ============================================

/**
 * Rule: Drawers must fit within cabinet height.
 */
export const DRAWER_FIT_RULE = createRule(
  'DRAWER_FIT',
  'Total drawer height must fit within cabinet',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    if (!drawers?.enabled || drawers.rows.length === 0) {
      return [];
    }

    // Calculate available height
    const toeKick = intent.dimensions.toeKickHeight ?? 0;
    const carcassThickness = intent.materials.carcassThickness;
    const availableHeight = intent.dimensions.height - toeKick - (carcassThickness * 2);

    // Calculate total drawer height
    let totalDrawerHeight = 0;
    for (const row of drawers.rows) {
      totalDrawerHeight += row.frontHeight + row.gapAbove;
    }

    if (totalDrawerHeight > availableHeight) {
      return [
        blocker(
          'DRAWERS_EXCEED_HEIGHT',
          `Total drawer height ${totalDrawerHeight}mm exceeds available space ${availableHeight}mm`,
          'drawers.rows',
          'Reduce drawer heights, remove drawer rows, or increase cabinet height'
        ),
      ];
    }

    // Warning if drawers take up almost all space
    if (totalDrawerHeight > availableHeight * 0.95) {
      return [
        warning(
          'DRAWERS_FILL_CABINET',
          `Drawers use ${Math.round((totalDrawerHeight / availableHeight) * 100)}% of cabinet height`,
          'drawers.rows',
          'Very tight fit. Consider reducing drawer count or heights.'
        ),
      ];
    }

    return [];
  }
);

// ============================================
// SLIDE COMPATIBILITY RULES
// ============================================

/**
 * Rule: Cabinet depth must accommodate drawer slides.
 */
export const DRAWER_DEPTH_RULE = createRule(
  'DRAWER_DEPTH',
  'Cabinet depth must be sufficient for drawer slides',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    if (!drawers?.enabled) {
      return [];
    }

    // Minimum depth for undermount slides (slide length + back clearance)
    const minDepthUndermount = 250 + 18; // Shortest slide + clearance
    // Minimum depth for side mount slides
    const minDepthSideMount = 250; // Shortest slide

    const minRequired = drawers.slideType === 'undermount' ? minDepthUndermount : minDepthSideMount;

    if (intent.dimensions.depth < minRequired) {
      return [
        blocker(
          'CABINET_TOO_SHALLOW_FOR_DRAWERS',
          `Cabinet depth ${intent.dimensions.depth}mm is insufficient for ${drawers.slideType} slides (need ${minRequired}mm)`,
          'dimensions.depth',
          `Increase cabinet depth to at least ${minRequired}mm`
        ),
      ];
    }

    return [];
  }
);

/**
 * Rule: Drawer width must be compatible with slide type.
 */
export const DRAWER_WIDTH_RULE = createRule(
  'DRAWER_WIDTH',
  'Cabinet width must be sufficient for drawer box and slides',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    if (!drawers?.enabled) {
      return [];
    }

    // Calculate inner width
    const carcassThickness = intent.materials.carcassThickness;
    const innerWidth = intent.dimensions.width - (carcassThickness * 2);

    // Slide clearances
    const undermountClearance = 41; // 20.5mm per side
    const sideMountClearance = 25; // 12.5mm per side

    const clearance = drawers.slideType === 'undermount' ? undermountClearance : sideMountClearance;
    const drawerBoxWidth = innerWidth - clearance;

    // Minimum practical drawer width
    const minDrawerWidth = 200;

    if (drawerBoxWidth < minDrawerWidth) {
      return [
        blocker(
          'DRAWER_TOO_NARROW',
          `Drawer box width ${drawerBoxWidth}mm is below minimum practical ${minDrawerWidth}mm`,
          'dimensions.width',
          `Increase cabinet width or switch to ${drawers.slideType === 'undermount' ? 'side mount' : 'undermount'} slides`
        ),
      ];
    }

    return [];
  }
);

// ============================================
// MIXED CONFIGURATION RULES
// ============================================

/**
 * Rule: Drawers with doors warning.
 */
export const DRAWERS_WITH_DOORS_RULE = createRule(
  'DRAWERS_WITH_DOORS',
  'Drawers and doors configuration check',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    const doors = intent.doors;

    if (drawers?.enabled && doors?.enabled) {
      // This is valid for drawer bank under door, but worth noting
      return [
        info(
          'DRAWERS_AND_DOORS',
          'Cabinet has both drawers and doors - ensure layout is intended',
          'drawers',
          'Common configurations: drawers below door, or drawer bank only'
        ),
      ];
    }

    return [];
  }
);

/**
 * Rule: Heavy load drawer recommendations.
 */
export const DRAWER_LOAD_RULE = createRule(
  'DRAWER_LOAD',
  'Heavy load drawers need appropriate slides',
  (intent: DesignerIntent): DesignerIssue[] => {
    const drawers = intent.drawers;
    if (!drawers?.enabled) {
      return [];
    }

    const issues: DesignerIssue[] = [];

    for (let i = 0; i < drawers.rows.length; i++) {
      const row = drawers.rows[i];

      if (row.loadCapacity === 'heavy' && drawers.slideType === 'side_mount') {
        issues.push(
          warning(
            'HEAVY_DRAWER_SLIDE_TYPE',
            `Heavy load drawer row ${i + 1} should use undermount slides for better support`,
            `drawers.slideType`,
            'Undermount slides provide better load capacity for heavy items'
          )
        );
        break; // Only warn once
      }
    }

    return issues;
  }
);

// ============================================
// EXPORT ALL DRAWER RULES
// ============================================

export const DRAWER_RULES: DesignerRule[] = [
  DRAWER_FRONT_HEIGHT_RULE,
  DRAWER_GAP_RULE,
  DRAWER_COUNT_RULE,
  DRAWER_FIT_RULE,
  DRAWER_DEPTH_RULE,
  DRAWER_WIDTH_RULE,
  DRAWERS_WITH_DOORS_RULE,
  DRAWER_LOAD_RULE,
];
