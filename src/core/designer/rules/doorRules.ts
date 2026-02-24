/**
 * Door Rules - Door Configuration Validation
 *
 * Validates door dimensions, hinge compatibility,
 * and opening type constraints.
 *
 * v1.0: Initial door rules
 */

import type { DesignerIntent, DesignerIssue, DesignerRule } from '../types';
import { DOOR_LIMITS, getRequiredHingeCount } from '../policy';
import { createRule, blocker, warning, info } from './ruleRegistry';

// ============================================
// DOOR SIZE RULES
// ============================================

/**
 * Rule: Maximum door width.
 */
export const DOOR_MAX_WIDTH_RULE = createRule(
  'DOOR_MAX_WIDTH',
  'Single door panels should not exceed 600mm width',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    // Calculate door width based on cabinet width and door count
    const cabinetWidth = intent.dimensions.width;
    const doorWidth = cabinetWidth / doors.count;

    if (doorWidth > DOOR_LIMITS.maxWidth) {
      return [
        warning(
          'DOOR_TOO_WIDE',
          `Door width ${doorWidth.toFixed(0)}mm exceeds recommended maximum ${DOOR_LIMITS.maxWidth}mm`,
          'doors.count',
          doors.count === 1
            ? 'Consider using double doors instead of a single door'
            : 'Consider a wider cabinet or different door configuration'
        ),
      ];
    }

    return [];
  }
);

/**
 * Rule: Door height limits.
 */
export const DOOR_HEIGHT_RULE = createRule(
  'DOOR_HEIGHT',
  'Door height must be within manufacturing limits',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    const doorHeight = intent.dimensions.height - (intent.dimensions.toeKickHeight ?? 0);

    if (doorHeight > DOOR_LIMITS.maxHeight) {
      return [
        blocker(
          'DOOR_TOO_TALL',
          `Door height ${doorHeight}mm exceeds maximum ${DOOR_LIMITS.maxHeight}mm`,
          'dimensions.height',
          'Reduce cabinet height or use stacked doors'
        ),
      ];
    }

    if (doorHeight < DOOR_LIMITS.minHeight) {
      return [
        blocker(
          'DOOR_TOO_SHORT',
          `Door height ${doorHeight}mm is below minimum ${DOOR_LIMITS.minHeight}mm`,
          'dimensions.height',
          'Increase cabinet height'
        ),
      ];
    }

    return [];
  }
);

// ============================================
// HINGE COMPATIBILITY RULES
// ============================================

/**
 * Rule: Lift doors require cup hinges.
 */
export const LIFT_HINGE_RULE = createRule(
  'LIFT_HINGE',
  'Lift-up doors require cup hinges with lift mechanism',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    if (doors.openingType === 'lift' && doors.hingeType !== 'cup') {
      return [
        blocker(
          'LIFT_NEEDS_CUP_HINGE',
          'Lift-up doors require cup hinges with integrated lift mechanism',
          'doors.hingeType',
          'Change hinge type to "cup" or change opening type to "swing"'
        ),
      ];
    }

    return [];
  }
);

/**
 * Rule: Flap doors need specific hinges.
 */
export const FLAP_HINGE_RULE = createRule(
  'FLAP_HINGE',
  'Flap doors require appropriate hinge type',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    if (doors.openingType === 'flap' && doors.hingeType !== 'cup') {
      return [
        warning(
          'FLAP_PREFERS_CUP_HINGE',
          'Flap doors work best with cup hinges with stay support',
          'doors.hingeType',
          'Consider using cup hinges for better flap support'
        ),
      ];
    }

    return [];
  }
);

/**
 * Rule: Piano hinges for wide doors.
 */
export const PIANO_HINGE_RULE = createRule(
  'PIANO_HINGE',
  'Piano hinges are recommended for very tall doors',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    const doorHeight = intent.dimensions.height - (intent.dimensions.toeKickHeight ?? 0);

    // Suggest piano hinge for very tall doors
    if (doorHeight > 2000 && doors.hingeType !== 'piano') {
      return [
        info(
          'CONSIDER_PIANO_HINGE',
          `For doors taller than 2000mm (${doorHeight}mm), piano hinges provide continuous support`,
          'doors.hingeType',
          'Consider piano hinges for very tall doors'
        ),
      ];
    }

    return [];
  }
);

// ============================================
// HINGE COUNT RULES
// ============================================

/**
 * Rule: Hinge count based on door height.
 */
export const HINGE_COUNT_RULE = createRule(
  'HINGE_COUNT',
  'Number of hinges should match door height',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    const doorHeight = intent.dimensions.height - (intent.dimensions.toeKickHeight ?? 0);
    const requiredHinges = getRequiredHingeCount(doorHeight);

    // If door config specifies hinge count, validate it
    const doorPanel = doors.count > 0 ? intent.doors : null;

    // Info about recommended hinge count
    return [
      info(
        'RECOMMENDED_HINGE_COUNT',
        `For door height ${doorHeight}mm, ${requiredHinges} hinges are recommended`,
        'doors',
        `Use ${requiredHinges} hinges for optimal door support`
      ),
    ];
  }
);

// ============================================
// OVERLAY RULES
// ============================================

/**
 * Rule: Inset doors with thick panels.
 */
export const INSET_OVERLAY_RULE = createRule(
  'INSET_OVERLAY',
  'Inset doors require precise fitting',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    if (doors.overlayType === 'inset') {
      return [
        info(
          'INSET_PRECISION',
          'Inset doors require precise fitting and may show more wear over time',
          'doors.overlayType',
          'Consider full overlay for easier installation and adjustment'
        ),
      ];
    }

    return [];
  }
);

// ============================================
// BIFOLD RULES
// ============================================

/**
 * Rule: Bifold doors require even count.
 */
export const BIFOLD_COUNT_RULE = createRule(
  'BIFOLD_COUNT',
  'Bifold doors typically require 2 door panels',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled) {
      return [];
    }

    if (doors.openingType === 'bifold' && doors.count !== 2) {
      return [
        warning(
          'BIFOLD_NEEDS_TWO_DOORS',
          'Bifold door systems typically require 2 door panels',
          'doors.count',
          'Set door count to 2 for bifold configuration'
        ),
      ];
    }

    return [];
  }
);

// ============================================
// HANDLE RULES
// ============================================

/**
 * Rule: Handle position validation.
 */
export const HANDLE_POSITION_RULE = createRule(
  'HANDLE_POSITION',
  'Handle position should be ergonomically appropriate',
  (intent: DesignerIntent): DesignerIssue[] => {
    const doors = intent.doors;
    if (!doors?.enabled || !doors.handleConfig) {
      return [];
    }

    const { height, type } = doors.handleConfig;
    const doorHeight = intent.dimensions.height - (intent.dimensions.toeKickHeight ?? 0);

    // Skip for handleless designs
    if (type === 'none' || type === 'push_latch') {
      return [];
    }

    // Handle should be within door bounds
    if (height && (height < 50 || height > doorHeight - 50)) {
      return [
        warning(
          'HANDLE_POSITION_EDGE',
          `Handle position ${height}mm is too close to door edge`,
          'doors.handleConfig.height',
          'Position handle at least 50mm from door edges'
        ),
      ];
    }

    // Ergonomic height for base cabinets (approximately waist height)
    if (intent.cabinetType === 'BASE' && height && height > 1200) {
      return [
        info(
          'HANDLE_HEIGHT_HIGH',
          `Handle at ${height}mm may be high for base cabinet`,
          'doors.handleConfig.height',
          'Standard handle height for base cabinets is 800-1000mm from floor'
        ),
      ];
    }

    return [];
  }
);

// ============================================
// EXPORT ALL DOOR RULES
// ============================================

export const DOOR_RULES: DesignerRule[] = [
  DOOR_MAX_WIDTH_RULE,
  DOOR_HEIGHT_RULE,
  LIFT_HINGE_RULE,
  FLAP_HINGE_RULE,
  PIANO_HINGE_RULE,
  HINGE_COUNT_RULE,
  INSET_OVERLAY_RULE,
  BIFOLD_COUNT_RULE,
  HANDLE_POSITION_RULE,
];
