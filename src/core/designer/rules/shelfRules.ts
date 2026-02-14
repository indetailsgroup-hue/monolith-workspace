/**
 * Shelf Rules - Shelf Configuration Validation
 *
 * Validates shelf thickness, span limits,
 * and System 32 alignment.
 *
 * v1.0: Initial shelf rules
 */

import type { DesignerIntent, DesignerIssue, DesignerRule } from '../types';
import {
  SHELF_LIMITS,
  SYSTEM_32,
  getMaxShelfSpan,
  isAlignedToSystem32,
  getNearestSystem32Position,
} from '../policy';
import { createRule, blocker, warning, info } from './ruleRegistry';

// ============================================
// SHELF THICKNESS RULES
// ============================================

/**
 * Rule: Adjustable shelf minimum thickness.
 */
export const ADJUSTABLE_SHELF_THICKNESS_RULE = createRule(
  'ADJUSTABLE_SHELF_THICKNESS',
  'Adjustable shelves must be at least 14mm thick',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];

    for (let i = 0; i < intent.shelves.length; i++) {
      const shelf = intent.shelves[i];

      if (shelf.type === 'adjustable' && shelf.thickness < SHELF_LIMITS.minAdjustableThickness) {
        issues.push(
          blocker(
            'ADJUSTABLE_SHELF_TOO_THIN',
            `Adjustable shelf "${shelf.id}" is ${shelf.thickness}mm thick, minimum is ${SHELF_LIMITS.minAdjustableThickness}mm`,
            `shelves.${i}.thickness`,
            `Increase thickness to at least ${SHELF_LIMITS.minAdjustableThickness}mm for proper shelf pin support`
          )
        );
      }
    }

    return issues;
  }
);

/**
 * Rule: General shelf thickness range.
 */
export const SHELF_THICKNESS_RANGE_RULE = createRule(
  'SHELF_THICKNESS_RANGE',
  'Shelf thickness must be within valid range',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];

    for (let i = 0; i < intent.shelves.length; i++) {
      const shelf = intent.shelves[i];

      if (shelf.thickness < SHELF_LIMITS.minThickness) {
        issues.push(
          blocker(
            'SHELF_TOO_THIN',
            `Shelf "${shelf.id}" thickness ${shelf.thickness}mm is below minimum ${SHELF_LIMITS.minThickness}mm`,
            `shelves.${i}.thickness`,
            `Increase thickness to at least ${SHELF_LIMITS.minThickness}mm`
          )
        );
      }

      if (shelf.thickness > SHELF_LIMITS.maxThickness) {
        issues.push(
          warning(
            'SHELF_VERY_THICK',
            `Shelf "${shelf.id}" thickness ${shelf.thickness}mm is unusually thick`,
            `shelves.${i}.thickness`,
            'Consider using standard 18mm or 22mm shelves'
          )
        );
      }
    }

    return issues;
  }
);

// ============================================
// SHELF SPAN RULES
// ============================================

/**
 * Rule: Shelf span must not exceed material limits.
 */
export const SHELF_SPAN_RULE = createRule(
  'SHELF_SPAN',
  'Shelf span must be within material strength limits',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];

    // Calculate span (width minus dividers)
    const baseSpan = intent.dimensions.width - (intent.materials.carcassThickness * 2);
    const maxSpan = getMaxShelfSpan();

    // If no dividers, span is full width
    if (intent.dividers.length === 0) {
      for (let i = 0; i < intent.shelves.length; i++) {
        const shelf = intent.shelves[i];

        if (baseSpan > maxSpan) {
          issues.push(
            blocker(
              'SHELF_SPAN_EXCEEDED',
              `Shelf "${shelf.id}" span ${baseSpan}mm exceeds maximum ${maxSpan}mm for the material`,
              `shelves.${i}`,
              'Add a vertical divider or use thicker shelves'
            )
          );
        }
      }
    } else {
      // Check each span between dividers
      const dividerPositions = [
        0,
        ...intent.dividers.map((d) => d.positionX).sort((a, b) => a - b),
        intent.dimensions.width,
      ];

      for (let j = 0; j < dividerPositions.length - 1; j++) {
        const span = dividerPositions[j + 1] - dividerPositions[j];

        if (span > maxSpan) {
          for (let i = 0; i < intent.shelves.length; i++) {
            const shelf = intent.shelves[i];
            issues.push(
              warning(
                'SHELF_SPAN_SECTION_EXCEEDED',
                `Shelf "${shelf.id}" has a span section of ${span}mm which exceeds ${maxSpan}mm`,
                `shelves.${i}`,
                'Add more dividers or use thicker shelves in this section'
              )
            );
          }
          break; // Only warn once per span issue
        }
      }
    }

    return issues;
  }
);

/**
 * Rule: Heavy load shelves need shorter spans.
 */
export const SHELF_LOAD_RULE = createRule(
  'SHELF_LOAD',
  'Heavy load shelves need shorter spans or thicker material',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];
    const baseSpan = intent.dimensions.width - (intent.materials.carcassThickness * 2);

    for (let i = 0; i < intent.shelves.length; i++) {
      const shelf = intent.shelves[i];

      if (shelf.loadCapacity === 'heavy') {
        // Heavy load reduces max span by 30%
        const reducedMaxSpan = Math.floor(getMaxShelfSpan() * 0.7);

        if (baseSpan > reducedMaxSpan) {
          issues.push(
            warning(
              'HEAVY_SHELF_SPAN',
              `Heavy-duty shelf "${shelf.id}" span ${baseSpan}mm exceeds recommended ${reducedMaxSpan}mm`,
              `shelves.${i}.loadCapacity`,
              'Add dividers, use thicker shelves, or reduce load capacity rating'
            )
          );
        }

        // Heavy load needs thicker shelves
        if (shelf.thickness < 18) {
          issues.push(
            warning(
              'HEAVY_SHELF_THICKNESS',
              `Heavy-duty shelf "${shelf.id}" should be at least 18mm thick`,
              `shelves.${i}.thickness`,
              'Increase thickness to 18mm or 22mm for heavy loads'
            )
          );
        }
      }
    }

    return issues;
  }
);

// ============================================
// SYSTEM 32 ALIGNMENT RULES
// ============================================

/**
 * Rule: Adjustable shelf positions should align with System 32.
 */
export const SHELF_SYSTEM_32_RULE = createRule(
  'SHELF_SYSTEM_32',
  'Adjustable shelf positions should align with System 32 hole pattern',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];

    for (let i = 0; i < intent.shelves.length; i++) {
      const shelf = intent.shelves[i];

      if (shelf.type === 'adjustable') {
        if (!isAlignedToSystem32(shelf.positionY)) {
          const nearestPosition = getNearestSystem32Position(shelf.positionY);

          issues.push(
            info(
              'SHELF_NOT_ON_SYSTEM_32',
              `Adjustable shelf "${shelf.id}" at ${shelf.positionY}mm doesn't align with System 32 holes`,
              `shelves.${i}.positionY`,
              `Move to ${nearestPosition}mm for proper System 32 alignment`
            )
          );
        }
      }
    }

    return issues;
  }
);

// ============================================
// SHELF POSITION RULES
// ============================================

/**
 * Rule: Shelf position must be within cabinet bounds.
 */
export const SHELF_POSITION_RULE = createRule(
  'SHELF_POSITION',
  'Shelf position must be within cabinet interior',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];

    const carcassThickness = intent.materials.carcassThickness;
    const minY = carcassThickness + 50; // Minimum clearance from bottom
    const maxY = intent.dimensions.height - carcassThickness - 50; // Clearance from top

    for (let i = 0; i < intent.shelves.length; i++) {
      const shelf = intent.shelves[i];

      if (shelf.positionY < minY) {
        issues.push(
          blocker(
            'SHELF_TOO_LOW',
            `Shelf "${shelf.id}" at ${shelf.positionY}mm is too close to cabinet bottom`,
            `shelves.${i}.positionY`,
            `Position shelf at least ${minY}mm from bottom`
          )
        );
      }

      if (shelf.positionY > maxY) {
        issues.push(
          blocker(
            'SHELF_TOO_HIGH',
            `Shelf "${shelf.id}" at ${shelf.positionY}mm is too close to cabinet top`,
            `shelves.${i}.positionY`,
            `Position shelf no higher than ${maxY}mm`
          )
        );
      }
    }

    return issues;
  }
);

/**
 * Rule: Shelves should not overlap.
 */
export const SHELF_OVERLAP_RULE = createRule(
  'SHELF_OVERLAP',
  'Shelves must not overlap with each other',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];

    // Sort shelves by position
    const sortedShelves = [...intent.shelves].sort((a, b) => a.positionY - b.positionY);

    for (let i = 0; i < sortedShelves.length - 1; i++) {
      const current = sortedShelves[i];
      const next = sortedShelves[i + 1];

      const minGap = Math.max(current.thickness, next.thickness) + 50; // Minimum clearance
      const actualGap = next.positionY - current.positionY;

      if (actualGap < minGap) {
        issues.push(
          blocker(
            'SHELF_OVERLAP',
            `Shelves "${current.id}" and "${next.id}" are too close (${actualGap}mm gap, need ${minGap}mm)`,
            `shelves`,
            `Increase gap between shelves to at least ${minGap}mm`
          )
        );
      }
    }

    return issues;
  }
);

// ============================================
// SHELF DEPTH RULES
// ============================================

/**
 * Rule: Shelf depth ratio validation.
 */
export const SHELF_DEPTH_RULE = createRule(
  'SHELF_DEPTH',
  'Shelf depth ratio must be within valid range',
  (intent: DesignerIntent): DesignerIssue[] => {
    const issues: DesignerIssue[] = [];

    for (let i = 0; i < intent.shelves.length; i++) {
      const shelf = intent.shelves[i];
      const depthRatio = shelf.depthRatio ?? 1.0;

      if (depthRatio < SHELF_LIMITS.minDepthRatio) {
        issues.push(
          warning(
            'SHELF_TOO_SHALLOW',
            `Shelf "${shelf.id}" depth ratio ${depthRatio} is below minimum ${SHELF_LIMITS.minDepthRatio}`,
            `shelves.${i}.depthRatio`,
            `Increase depth ratio to at least ${SHELF_LIMITS.minDepthRatio}`
          )
        );
      }

      if (depthRatio > SHELF_LIMITS.maxDepthRatio) {
        issues.push(
          blocker(
            'SHELF_DEPTH_EXCEEDED',
            `Shelf "${shelf.id}" depth ratio ${depthRatio} exceeds maximum ${SHELF_LIMITS.maxDepthRatio}`,
            `shelves.${i}.depthRatio`,
            `Depth ratio cannot exceed ${SHELF_LIMITS.maxDepthRatio}`
          )
        );
      }
    }

    return issues;
  }
);

// ============================================
// EXPORT ALL SHELF RULES
// ============================================

export const SHELF_RULES: DesignerRule[] = [
  ADJUSTABLE_SHELF_THICKNESS_RULE,
  SHELF_THICKNESS_RANGE_RULE,
  SHELF_SPAN_RULE,
  SHELF_LOAD_RULE,
  SHELF_SYSTEM_32_RULE,
  SHELF_POSITION_RULE,
  SHELF_OVERLAP_RULE,
  SHELF_DEPTH_RULE,
];
