/**
 * Rule Registry - Validation Rule Execution Framework
 *
 * Central registry for all designer validation rules.
 * Rules are organized by category and can be enabled/disabled.
 *
 * v1.0: Initial rule registry
 */

import type {
  DesignerIntent,
  DesignerIssue,
  DesignerRule,
  RuleCategory,
  RuleRegistryEntry,
  DesignerValidation,
} from '../types';

// ============================================
// RULE REGISTRY
// ============================================

/**
 * Global rule registry.
 */
const ruleRegistry: Map<string, RuleRegistryEntry> = new Map();

/**
 * Register a rule in the registry.
 */
export function registerRule(
  rule: DesignerRule,
  category: RuleCategory,
  enabled = true
): void {
  ruleRegistry.set(rule.id, { rule, category, enabled });
}

/**
 * Register multiple rules.
 */
export function registerRules(
  rules: DesignerRule[],
  category: RuleCategory,
  enabled = true
): void {
  for (const rule of rules) {
    registerRule(rule, category, enabled);
  }
}

/**
 * Enable a rule by ID.
 */
export function enableRule(ruleId: string): void {
  const entry = ruleRegistry.get(ruleId);
  if (entry) {
    entry.enabled = true;
  }
}

/**
 * Disable a rule by ID.
 */
export function disableRule(ruleId: string): void {
  const entry = ruleRegistry.get(ruleId);
  if (entry) {
    entry.enabled = false;
  }
}

/**
 * Get all registered rules.
 */
export function getAllRules(): RuleRegistryEntry[] {
  return Array.from(ruleRegistry.values());
}

/**
 * Get rules by category.
 */
export function getRulesByCategory(category: RuleCategory): RuleRegistryEntry[] {
  return getAllRules().filter((entry) => entry.category === category);
}

/**
 * Get enabled rules.
 */
export function getEnabledRules(): DesignerRule[] {
  return getAllRules()
    .filter((entry) => entry.enabled)
    .map((entry) => entry.rule);
}

/**
 * Clear all rules (for testing).
 */
export function clearRules(): void {
  ruleRegistry.clear();
}

// ============================================
// RULE EXECUTION
// ============================================

/**
 * Execute all enabled rules against an intent.
 * Returns all issues found.
 */
export function executeRules(intent: DesignerIntent): DesignerIssue[] {
  const enabledRules = getEnabledRules();
  const allIssues: DesignerIssue[] = [];

  for (const rule of enabledRules) {
    try {
      const issues = rule.check(intent);
      allIssues.push(...issues);
    } catch (error) {
      // Rule threw an error - add as a blocker
      allIssues.push({
        code: 'RULE_ERROR',
        severity: 'blocker',
        message: `Rule ${rule.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        field: undefined,
        suggestion: 'Check the rule implementation',
      });
    }
  }

  return allIssues;
}

/**
 * Execute rules and categorize by severity.
 */
export function validateIntent(intent: DesignerIntent): DesignerValidation {
  const allIssues = executeRules(intent);

  const blockers = allIssues.filter((i) => i.severity === 'blocker');
  const warnings = allIssues.filter((i) => i.severity === 'warning');
  const info = allIssues.filter((i) => i.severity === 'info');

  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    info,
  };
}

// ============================================
// RULE CREATION HELPERS
// ============================================

/**
 * Create a simple rule from a check function.
 */
export function createRule(
  id: string,
  description: string,
  check: (intent: DesignerIntent) => DesignerIssue[]
): DesignerRule {
  return { id, description, check };
}

/**
 * Create a blocker issue.
 */
export function blocker(
  code: string,
  message: string,
  field?: string,
  suggestion?: string
): DesignerIssue {
  return { code, severity: 'blocker', message, field, suggestion };
}

/**
 * Create a warning issue.
 */
export function warning(
  code: string,
  message: string,
  field?: string,
  suggestion?: string
): DesignerIssue {
  return { code, severity: 'warning', message, field, suggestion };
}

/**
 * Create an info issue.
 */
export function info(
  code: string,
  message: string,
  field?: string,
  suggestion?: string
): DesignerIssue {
  return { code, severity: 'info', message, field, suggestion };
}
