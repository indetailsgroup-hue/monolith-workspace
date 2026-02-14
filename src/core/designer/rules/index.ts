/**
 * Rules Module - Exports all validation rules
 *
 * v1.0: Initial rules export
 */

// Re-export registry functions
export {
  registerRule,
  registerRules,
  enableRule,
  disableRule,
  getAllRules,
  getRulesByCategory,
  getEnabledRules,
  clearRules,
  executeRules,
  validateIntent,
  createRule,
  blocker,
  warning,
  info,
} from './ruleRegistry';

// Export rule collections
export { STRUCTURAL_RULES } from './structuralRules';
export { DOOR_RULES } from './doorRules';
export { SHELF_RULES } from './shelfRules';
export { DRAWER_RULES } from './drawerRules';

// Import for initialization
import { registerRules } from './ruleRegistry';
import { STRUCTURAL_RULES } from './structuralRules';
import { DOOR_RULES } from './doorRules';
import { SHELF_RULES } from './shelfRules';
import { DRAWER_RULES } from './drawerRules';

/**
 * Initialize all rules in the registry.
 * Call this once at application startup.
 */
export function initializeRules(): void {
  registerRules(STRUCTURAL_RULES, 'structural');
  registerRules(DOOR_RULES, 'door');
  registerRules(SHELF_RULES, 'shelf');
  registerRules(DRAWER_RULES, 'drawer');
}

/**
 * Get all rules as a flat array.
 */
export function getAllRuleDefinitions() {
  return [
    ...STRUCTURAL_RULES,
    ...DOOR_RULES,
    ...SHELF_RULES,
    ...DRAWER_RULES,
  ];
}
