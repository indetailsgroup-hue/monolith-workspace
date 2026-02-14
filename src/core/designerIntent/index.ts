/**
 * Designer Intent Module - Thai Localized
 *
 * Declarative rule-based intent evaluation for cabinet manufacturing.
 * Produces hardware selection, drilling plan, and assembly sequence.
 *
 * v1.0: Initial implementation
 * v1.1: Added RuleCategory export
 */

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  // Intent types
  DesignerIntentPDF,
  CabinetTypeIntent,
  CompositionDirection,
  BaseLogic,
  ShelfIntent2,
  DoorIntentPDF,
  DrawerIntentPDF,

  // Rule types
  DesignerRulePDF,
  RuleCondition,
  RuleEffect,
  Severity,
  RuleCategory,
  CompareOp,

  // Output types
  DesignerEvaluationPDF,
  HardwareSelectionPDF,
  HardwareItemPDF,
  DrillingPlanPDF,
  DrillOpPDF,
  AssemblyPlanPDF,
  AssemblyStepPDF,
  PanelId,
} from './types';

// ============================================
// RULE ENGINE EXPORTS
// ============================================

export {
  evaluateDesignerIntent,
  checkRequirement,
  getBlockedEffects,
  getWarningEffects,
} from './ruleEngine';

export type {
  EvaluateArgs,
  HardwareMapper,
  DrillingMapper,
  AssemblyMapper,
} from './ruleEngine';

// ============================================
// MAPPER EXPORTS
// ============================================

export { hardwareMapper, drillingMapper, assemblyMapper } from './mappers';

// ============================================
// DEFAULT RULES EXPORT
// ============================================

export {
  DEFAULT_DESIGNER_RULES,
  // Individual rules for selective use
  COMPOSITION_LEFT_TO_RIGHT,
  ADJUSTABLE_FOOT_IS_JOINT,
  SHELF_14MM_REQUIRES_DEDICATED_SLOT,
  PUSH_OPEN_REQUIRES_SYNC_BAR,
  JET_REQUIRES_DEEP_SHELF,
  MINIFIX_REQUIRES_16MM,
  SYSTEM_32_FIRST_HOLE,
} from './designerRules.default';

// ============================================
// CONVENIENCE FUNCTION
// ============================================

import type { DesignerIntentPDF, DesignerEvaluationPDF } from './types';
import { evaluateDesignerIntent } from './ruleEngine';
import { hardwareMapper } from './mappers/hardwareMapper';
import { drillingMapper } from './mappers/drillingMapper';
import { assemblyMapper } from './mappers/assemblyMapper';
import { DEFAULT_DESIGNER_RULES } from './designerRules.default';

/**
 * Evaluate designer intent with default rules and mappers.
 *
 * This is the main entry point for the Designer Intent module.
 *
 * @param intent - Designer intent configuration
 * @returns Evaluation result with hardware, drilling, and assembly plans
 */
export function evaluateIntent(intent: DesignerIntentPDF): DesignerEvaluationPDF {
  return evaluateDesignerIntent({
    intent,
    rules: DEFAULT_DESIGNER_RULES,
    hardwareMapper,
    drillingMapper,
    assemblyMapper,
  });
}

/**
 * Create a default designer intent.
 */
export function createDefaultIntentPDF(): DesignerIntentPDF {
  return {
    cabinetType: 'BASE',
    compositionDirection: 'LEFT_TO_RIGHT',
    baseLogic: 'ADJUSTABLE_FOOT',
    backPanel: true,
    shelf: {
      enabled: true,
      supportType: 'ADJUSTABLE',
      count: 1,
      thickness: 18,
    },
    divider: {
      enabled: false,
    },
    door: {
      enabled: false,
    },
    drawer: {
      enabled: false,
    },
    usesSystem32: true,
    connectorType: 'MINIFIX',
    panelThickness: 18,
    dimensions: {
      width: 600,
      height: 720,
      depth: 560,
    },
  };
}

// ============================================
// CNC BRIDGE EXPORTS
// ============================================

export {
  convertDrillingPlanToCncOverlay,
  syncToCncOverlayStore,
} from './cncBridge';

export type {
  CncOverlayPoint,
  CncOverlayBuildResult,
  ConvertToCncOptions,
} from './cncBridge';
