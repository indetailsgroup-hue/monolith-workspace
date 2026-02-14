/**
 * Designer Rule Engine - Declarative rule evaluation
 *
 * Evaluates rules against designer intent and produces:
 * - Hardware selection
 * - Drilling plan
 * - Assembly plan
 * - Gate status (warn/block)
 *
 * v1.0: Initial rule engine
 */

import type {
  DesignerIntentPDF,
  DesignerRulePDF,
  RuleEffect,
  RuleCondition,
  DesignerEvaluationPDF,
  HardwareSelectionPDF,
  DrillingPlanPDF,
  AssemblyPlanPDF,
} from './types';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get value from object by dot-notation path.
 */
function get(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

/**
 * Set value in object by dot-notation path.
 */
function set(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  let current = obj as Record<string, unknown>;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Compare values using the specified operator.
 */
function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case 'eq':
      return left === right;
    case 'neq':
      return left !== right;
    case 'in':
      return Array.isArray(right) ? right.includes(left) : false;
    case 'lt':
      return typeof left === 'number' && typeof right === 'number'
        ? left < right
        : false;
    case 'lte':
      return typeof left === 'number' && typeof right === 'number'
        ? left <= right
        : false;
    case 'gt':
      return typeof left === 'number' && typeof right === 'number'
        ? left > right
        : false;
    case 'gte':
      return typeof left === 'number' && typeof right === 'number'
        ? left >= right
        : false;
    case 'exists':
      return left !== undefined && left !== null;
    default:
      return false;
  }
}

/**
 * Check if a condition matches the intent.
 */
function matchCondition(intent: DesignerIntentPDF, c: RuleCondition): boolean {
  const value = get(intent, c.path);
  return compare(c.op, value, c.value);
}

/**
 * Apply effects to intent and derived values.
 */
function applyEffects(
  intent: DesignerIntentPDF,
  effects: RuleEffect[],
  derived: Record<string, unknown>
): void {
  for (const effect of effects) {
    // Apply 'set' operations
    if (effect.set) {
      for (const s of effect.set) {
        set(intent, s.path, s.value);
      }
    }
    // Apply 'derive' operations
    if (effect.derive) {
      for (const d of effect.derive) {
        derived[d.key] = d.value;
      }
    }
  }
}

// ============================================
// MAPPER TYPE DEFINITIONS
// ============================================

export type HardwareMapper = (
  intent: DesignerIntentPDF,
  effects: RuleEffect[],
  derived: Record<string, unknown>
) => HardwareSelectionPDF;

export type DrillingMapper = (
  intent: DesignerIntentPDF,
  effects: RuleEffect[],
  derived: Record<string, unknown>
) => DrillingPlanPDF;

export type AssemblyMapper = (
  intent: DesignerIntentPDF,
  effects: RuleEffect[],
  derived: Record<string, unknown>
) => AssemblyPlanPDF;

// ============================================
// MAIN EVALUATION FUNCTION
// ============================================

export interface EvaluateArgs {
  intent: DesignerIntentPDF;
  rules: DesignerRulePDF[];
  hardwareMapper: HardwareMapper;
  drillingMapper: DrillingMapper;
  assemblyMapper: AssemblyMapper;
}

/**
 * Evaluate designer intent against rules and produce output.
 */
export function evaluateDesignerIntent(args: EvaluateArgs): DesignerEvaluationPDF {
  // Clone intent so rule effects don't mutate caller's object
  const intent = structuredClone(args.intent);
  const derived: Record<string, unknown> = {};

  // Collect all matched effects
  const effects: RuleEffect[] = [];

  for (const rule of args.rules) {
    // Check if all conditions match
    const allMatch = rule.when.every((c) => matchCondition(intent, c));
    if (!allMatch) continue;

    // Collect effects
    for (const effect of rule.then) {
      effects.push(effect);
    }

    // Apply effects immediately (order matters)
    applyEffects(intent, rule.then, derived);
  }

  // Categorize effects by severity
  const blocks = effects.filter((e) => e.severity === 'block');
  const warnings = effects.filter((e) => e.severity === 'warn');

  // Run mappers
  const hardware = args.hardwareMapper(intent, effects, derived);
  const drilling = args.drillingMapper(intent, effects, derived);
  const assembly = args.assemblyMapper(intent, effects, derived);

  // Add gate warning if blocked
  if (blocks.length > 0) {
    hardware.notesTH = [
      ...hardware.notesTH,
      '⚠️ มีเงื่อนไข BLOCK: ห้ามปล่อยงานไปโรงงานจนกว่าจะแก้ Intent ให้ผ่าน Gate',
    ];
  }

  return {
    intent,
    effects,
    hardware,
    drilling,
    assembly,
    derived,
    gate: {
      blocked: blocks.length > 0,
      warnings: warnings.map((w) => w.code),
      blocks: blocks.map((b) => b.code),
    },
  };
}

/**
 * Check if a specific requirement is met.
 */
export function checkRequirement(
  intent: DesignerIntentPDF,
  requirement: RuleCondition
): boolean {
  return matchCondition(intent, requirement);
}

/**
 * Get all blocked effects from evaluation.
 */
export function getBlockedEffects(evaluation: DesignerEvaluationPDF): RuleEffect[] {
  return evaluation.effects.filter((e) => e.severity === 'block');
}

/**
 * Get all warning effects from evaluation.
 */
export function getWarningEffects(evaluation: DesignerEvaluationPDF): RuleEffect[] {
  return evaluation.effects.filter((e) => e.severity === 'warn');
}
