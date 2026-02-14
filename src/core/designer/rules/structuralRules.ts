/**
 * Structural Rules - Dimension and Joint Validation
 *
 * Validates cabinet dimensions, panel thickness requirements,
 * and connector compatibility.
 *
 * v1.0: Initial structural rules
 */

import type { DesignerIntent, DesignerIssue, DesignerRule } from '../types';
import {
  DIMENSION_LIMITS,
  MATERIAL_LIMITS,
  CONNECTOR_LIMITS,
  getMinThicknessForConnector,
} from '../policy';
import { createRule, blocker, warning } from './ruleRegistry';

// ============================================
// DIMENSION RULES
// ============================================

/**
 * Rule: Minimum width check.
 */
export const MIN_WIDTH_RULE = createRule(
  'MIN_WIDTH',
  'Cabinet width must be at least 200mm',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { width } = intent.dimensions;
    if (width < DIMENSION_LIMITS.minWidth) {
      return [
        blocker(
          'WIDTH_TOO_SMALL',
          `Cabinet width ${width}mm is below minimum ${DIMENSION_LIMITS.minWidth}mm`,
          'dimensions.width',
          `Increase width to at least ${DIMENSION_LIMITS.minWidth}mm`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Maximum width check.
 */
export const MAX_WIDTH_RULE = createRule(
  'MAX_WIDTH',
  'Cabinet width must not exceed 2400mm',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { width } = intent.dimensions;
    if (width > DIMENSION_LIMITS.maxWidth) {
      return [
        blocker(
          'WIDTH_TOO_LARGE',
          `Cabinet width ${width}mm exceeds maximum ${DIMENSION_LIMITS.maxWidth}mm`,
          'dimensions.width',
          `Decrease width to at most ${DIMENSION_LIMITS.maxWidth}mm or split into multiple cabinets`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Minimum height check.
 */
export const MIN_HEIGHT_RULE = createRule(
  'MIN_HEIGHT',
  'Cabinet height must be at least 200mm',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { height } = intent.dimensions;
    if (height < DIMENSION_LIMITS.minHeight) {
      return [
        blocker(
          'HEIGHT_TOO_SMALL',
          `Cabinet height ${height}mm is below minimum ${DIMENSION_LIMITS.minHeight}mm`,
          'dimensions.height',
          `Increase height to at least ${DIMENSION_LIMITS.minHeight}mm`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Maximum height check.
 */
export const MAX_HEIGHT_RULE = createRule(
  'MAX_HEIGHT',
  'Cabinet height must not exceed 2400mm',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { height } = intent.dimensions;
    if (height > DIMENSION_LIMITS.maxHeight) {
      return [
        blocker(
          'HEIGHT_TOO_LARGE',
          `Cabinet height ${height}mm exceeds maximum ${DIMENSION_LIMITS.maxHeight}mm`,
          'dimensions.height',
          `Decrease height to at most ${DIMENSION_LIMITS.maxHeight}mm`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Minimum depth check.
 */
export const MIN_DEPTH_RULE = createRule(
  'MIN_DEPTH',
  'Cabinet depth must be at least 200mm',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { depth } = intent.dimensions;
    if (depth < DIMENSION_LIMITS.minDepth) {
      return [
        blocker(
          'DEPTH_TOO_SMALL',
          `Cabinet depth ${depth}mm is below minimum ${DIMENSION_LIMITS.minDepth}mm`,
          'dimensions.depth',
          `Increase depth to at least ${DIMENSION_LIMITS.minDepth}mm`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Maximum depth check.
 */
export const MAX_DEPTH_RULE = createRule(
  'MAX_DEPTH',
  'Cabinet depth must not exceed 800mm',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { depth } = intent.dimensions;
    if (depth > DIMENSION_LIMITS.maxDepth) {
      return [
        blocker(
          'DEPTH_TOO_LARGE',
          `Cabinet depth ${depth}mm exceeds maximum ${DIMENSION_LIMITS.maxDepth}mm`,
          'dimensions.depth',
          `Decrease depth to at most ${DIMENSION_LIMITS.maxDepth}mm`
        ),
      ];
    }
    return [];
  }
);

// ============================================
// MATERIAL THICKNESS RULES
// ============================================

/**
 * Rule: Minimum carcass thickness.
 */
export const MIN_CARCASS_THICKNESS_RULE = createRule(
  'MIN_CARCASS_THICKNESS',
  'Carcass panels must be at least 12mm thick',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { carcassThickness } = intent.materials;
    if (carcassThickness < MATERIAL_LIMITS.minCarcassThickness) {
      return [
        blocker(
          'CARCASS_TOO_THIN',
          `Carcass thickness ${carcassThickness}mm is below minimum ${MATERIAL_LIMITS.minCarcassThickness}mm`,
          'materials.carcassThickness',
          `Increase thickness to at least ${MATERIAL_LIMITS.minCarcassThickness}mm`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Maximum carcass thickness.
 */
export const MAX_CARCASS_THICKNESS_RULE = createRule(
  'MAX_CARCASS_THICKNESS',
  'Carcass panels should not exceed 25mm (unusual)',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { carcassThickness } = intent.materials;
    if (carcassThickness > MATERIAL_LIMITS.maxCarcassThickness) {
      return [
        warning(
          'CARCASS_VERY_THICK',
          `Carcass thickness ${carcassThickness}mm is unusually thick (max recommended: ${MATERIAL_LIMITS.maxCarcassThickness}mm)`,
          'materials.carcassThickness',
          'Consider using thinner panels unless specifically required'
        ),
      ];
    }
    return [];
  }
);

// ============================================
// CONNECTOR COMPATIBILITY RULES
// ============================================

/**
 * Rule: Minifix requires minimum 16mm panels.
 */
export const MINIFIX_THICKNESS_RULE = createRule(
  'MINIFIX_THICKNESS',
  'Minifix connectors require 16mm or thicker panels',
  (intent: DesignerIntent): DesignerIssue[] => {
    if (intent.connectors.primaryJoint !== 'minifix') {
      return [];
    }

    const { carcassThickness } = intent.materials;
    const minThickness = CONNECTOR_LIMITS.minifixMinThickness;

    if (carcassThickness < minThickness) {
      return [
        blocker(
          'MINIFIX_NEEDS_THICKER_PANELS',
          `Minifix connectors require minimum ${minThickness}mm panels, current is ${carcassThickness}mm`,
          'connectors.primaryJoint',
          `Increase panel thickness to ${minThickness}mm or switch to dowel joints`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Confirmat requires minimum 15mm panels.
 */
export const CONFIRMAT_THICKNESS_RULE = createRule(
  'CONFIRMAT_THICKNESS',
  'Confirmat screws require 15mm or thicker panels',
  (intent: DesignerIntent): DesignerIssue[] => {
    if (intent.connectors.primaryJoint !== 'confirmat') {
      return [];
    }

    const { carcassThickness } = intent.materials;
    const minThickness = CONNECTOR_LIMITS.confirmatMinThickness;

    if (carcassThickness < minThickness) {
      return [
        blocker(
          'CONFIRMAT_NEEDS_THICKER_PANELS',
          `Confirmat screws require minimum ${minThickness}mm panels, current is ${carcassThickness}mm`,
          'connectors.primaryJoint',
          `Increase panel thickness to ${minThickness}mm or switch to dowel joints`
        ),
      ];
    }
    return [];
  }
);

/**
 * Rule: Generic connector-thickness compatibility check.
 */
export const CONNECTOR_THICKNESS_RULE = createRule(
  'CONNECTOR_THICKNESS',
  'Panel thickness must be compatible with selected connector',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { primaryJoint } = intent.connectors;
    const { carcassThickness } = intent.materials;
    const minThickness = getMinThicknessForConnector(primaryJoint);

    if (carcassThickness < minThickness) {
      return [
        blocker(
          'CONNECTOR_INCOMPATIBLE',
          `${primaryJoint} connectors require minimum ${minThickness}mm panels, current is ${carcassThickness}mm`,
          'materials.carcassThickness',
          `Increase panel thickness to ${minThickness}mm or choose a different connector type`
        ),
      ];
    }
    return [];
  }
);

// ============================================
// BACK PANEL RULES
// ============================================

/**
 * Rule: Back panel thickness validation.
 */
export const BACK_PANEL_THICKNESS_RULE = createRule(
  'BACK_PANEL_THICKNESS',
  'Back panel thickness must be within valid range',
  (intent: DesignerIntent): DesignerIssue[] => {
    if (!intent.backPanel.enabled) {
      return [];
    }

    const { thickness } = intent.backPanel;

    if (thickness < MATERIAL_LIMITS.minBackThickness) {
      return [
        blocker(
          'BACK_PANEL_TOO_THIN',
          `Back panel thickness ${thickness}mm is below minimum ${MATERIAL_LIMITS.minBackThickness}mm`,
          'backPanel.thickness',
          `Increase thickness to at least ${MATERIAL_LIMITS.minBackThickness}mm`
        ),
      ];
    }

    if (thickness > MATERIAL_LIMITS.maxBackThickness) {
      return [
        warning(
          'BACK_PANEL_VERY_THICK',
          `Back panel thickness ${thickness}mm is unusually thick for a back panel`,
          'backPanel.thickness',
          `Consider using ${MATERIAL_LIMITS.defaultBackThickness}mm standard back panel`
        ),
      ];
    }

    return [];
  }
);

// ============================================
// TOE KICK RULES
// ============================================

/**
 * Rule: Toe kick height for base cabinets.
 */
export const TOE_KICK_RULE = createRule(
  'TOE_KICK',
  'Toe kick height must be appropriate for cabinet type',
  (intent: DesignerIntent): DesignerIssue[] => {
    const { toeKickHeight } = intent.dimensions;

    // Base cabinets should have toe kick
    if (intent.cabinetType === 'BASE') {
      if (!toeKickHeight || toeKickHeight < 50) {
        return [
          warning(
            'BASE_MISSING_TOE_KICK',
            'Base cabinets typically have a toe kick of 80-150mm',
            'dimensions.toeKickHeight',
            'Add toe kick height for better ergonomics'
          ),
        ];
      }
    }

    // Wall cabinets shouldn't have toe kick
    if (intent.cabinetType === 'WALL' && toeKickHeight && toeKickHeight > 0) {
      return [
        warning(
          'WALL_HAS_TOE_KICK',
          'Wall cabinets do not need a toe kick',
          'dimensions.toeKickHeight',
          'Remove toe kick for wall cabinet'
        ),
      ];
    }

    // Max toe kick height
    if (toeKickHeight && toeKickHeight > DIMENSION_LIMITS.maxToeKickHeight) {
      return [
        warning(
          'TOE_KICK_TOO_TALL',
          `Toe kick height ${toeKickHeight}mm is unusually tall (max recommended: ${DIMENSION_LIMITS.maxToeKickHeight}mm)`,
          'dimensions.toeKickHeight',
          'Standard toe kick is 80-150mm'
        ),
      ];
    }

    return [];
  }
);

// ============================================
// EXPORT ALL STRUCTURAL RULES
// ============================================

export const STRUCTURAL_RULES: DesignerRule[] = [
  MIN_WIDTH_RULE,
  MAX_WIDTH_RULE,
  MIN_HEIGHT_RULE,
  MAX_HEIGHT_RULE,
  MIN_DEPTH_RULE,
  MAX_DEPTH_RULE,
  MIN_CARCASS_THICKNESS_RULE,
  MAX_CARCASS_THICKNESS_RULE,
  MINIFIX_THICKNESS_RULE,
  CONFIRMAT_THICKNESS_RULE,
  CONNECTOR_THICKNESS_RULE,
  BACK_PANEL_THICKNESS_RULE,
  TOE_KICK_RULE,
];
