/**
 * edgeRule.ts - B2: Edge Rule Engine API
 *
 * NORTH STAR: "Exposed Edge ต้องมี Policy"
 * Auto-detect exposed edges and apply appropriate edge banding policy
 *
 * Features:
 * - Auto-detect exposed edges based on panel role
 * - Apply default edge policy to exposed edges
 * - Manual override for specific edges
 * - Integration with Gate validation
 *
 * @version 1.0.0 - Phase 1
 */

import { useCabinetStore } from '../store/useCabinetStore';
import type { Cabinet, CabinetPanel, PanelRole } from '../types/Cabinet';
import type {
  EdgeSide,
  EdgePolicy,
  EdgePolicyMode,
  EdgeRuleContext,
  EdgeAdjacency,
  PanelEdgeState,
  ApplyEdgeRulesInput,
  ApplyEdgeRulesResult,
  SetPanelEdgePolicyInput,
  EditResult,
} from './types';
import { DEFAULT_EDGE_POLICY } from './types';

// ============================================
// EDGE EXPOSURE RULES BY ROLE
// ============================================

/**
 * Define which edges are typically exposed for each panel role
 */
const ROLE_EXPOSED_EDGES: Record<PanelRole, EdgeSide[]> = {
  // Cabinet structure
  LEFT_SIDE: ['LEFT'],           // Front edge exposed
  RIGHT_SIDE: ['LEFT'],          // Front edge exposed
  TOP: ['LEFT'],                 // Front edge exposed
  BOTTOM: ['LEFT'],              // Front edge exposed (floor gap hides)
  BACK: [],                      // All edges hidden (against wall/inside)
  SHELF: ['LEFT'],               // Front edge exposed (back hidden)
  DIVIDER: ['LEFT'],             // Front edge exposed

  // Fronts (all edges exposed)
  FRONT: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'],
  DOOR: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'],
  DOOR_LEFT: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'],
  DOOR_RIGHT: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'],

  // Drawer parts
  DRAWER_FRONT: ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'],  // All edges exposed
  DRAWER_SIDE: [],                                    // Hidden inside drawer
  DRAWER_BACK: [],                                    // Hidden inside drawer
  DRAWER_BOTTOM: [],                                  // Hidden inside drawer
};

// ============================================
// EDGE RULE CONTEXT
// ============================================

/**
 * Get edge rule context for a panel
 *
 * @param panelId - Panel ID to analyze
 * @returns Edge rule context or null if panel not found
 */
export function getEdgeRuleContext(panelId: string): EdgeRuleContext | null {
  const cabinet = useCabinetStore.getState().cabinet;
  if (!cabinet) return null;

  const panel = cabinet.panels.find((p) => p.id === panelId);
  if (!panel) return null;

  // Determine adjacency for each edge
  const adjacency = determineEdgeAdjacency(panel, cabinet);

  // Determine if panel faces front
  const isFrontFacing = isFrontFacingRole(panel.role);

  return {
    panelId: panel.id,
    role: panel.role,
    isFrontFacing,
    adjacency,
    materialId: panel.coreMaterialId,
    cabinetType: 'CABINET', // TODO: Get from cabinet
  };
}

/**
 * Determine edge adjacency for all edges of a panel
 */
function determineEdgeAdjacency(
  panel: CabinetPanel,
  cabinet: Cabinet
): Record<EdgeSide, EdgeAdjacency> {
  const defaultExposed = ROLE_EXPOSED_EDGES[panel.role] || [];

  const adjacency: Record<EdgeSide, EdgeAdjacency> = {
    TOP: defaultExposed.includes('TOP') ? 'EXPOSED' : 'HIDDEN',
    BOTTOM: defaultExposed.includes('BOTTOM') ? 'EXPOSED' : 'HIDDEN',
    LEFT: defaultExposed.includes('LEFT') ? 'EXPOSED' : 'HIDDEN',
    RIGHT: defaultExposed.includes('RIGHT') ? 'EXPOSED' : 'HIDDEN',
  };

  // Refine based on cabinet structure
  // Check if cabinet has top/bottom by looking at joint type
  // INSET = top/bottom inside sides, OVERLAY = sides inside top/bottom
  const hasTopPanel = cabinet.panels.some(p => p.role === 'TOP');
  const hasBottomPanel = cabinet.panels.some(p => p.role === 'BOTTOM');

  switch (panel.role) {
    case 'LEFT_SIDE':
    case 'RIGHT_SIDE':
      // Top edge mated if cabinet has top panel with INSET joint
      if (hasTopPanel && cabinet.structure.topJoint === 'INSET') {
        adjacency.TOP = 'MATED';
      }
      // Bottom edge mated if cabinet has bottom panel with INSET joint
      if (hasBottomPanel && cabinet.structure.bottomJoint === 'INSET') {
        adjacency.BOTTOM = 'MATED';
      }
      // Back edge hidden (against wall or has back panel)
      adjacency.RIGHT = cabinet.structure.hasBackPanel ? 'MATED' : 'HIDDEN';
      break;

    case 'TOP':
    case 'BOTTOM':
      // Left/Right edges mated to side panels
      adjacency.LEFT = 'MATED';
      adjacency.RIGHT = 'MATED';
      break;

    case 'SHELF':
      // Shelves: left/right mated to sides, back hidden
      adjacency.LEFT = 'MATED';
      adjacency.RIGHT = 'MATED';
      adjacency.TOP = 'HIDDEN';
      adjacency.BOTTOM = 'HIDDEN';
      break;

    case 'DIVIDER':
      // Dividers: top/bottom mated to shelves/top/bottom
      adjacency.TOP = 'MATED';
      adjacency.BOTTOM = 'MATED';
      adjacency.RIGHT = 'HIDDEN'; // Back edge
      break;
  }

  return adjacency;
}

/**
 * Check if a role is front-facing (doors, drawer fronts)
 */
function isFrontFacingRole(role: PanelRole): boolean {
  return [
    'FRONT',
    'DOOR',
    'DOOR_LEFT',
    'DOOR_RIGHT',
    'DRAWER_FRONT',
  ].includes(role);
}

// ============================================
// EDGE STATE QUERIES
// ============================================

/**
 * Get current edge state for a panel
 *
 * @param panelId - Panel ID
 * @returns Array of edge states or empty if not found
 */
export function getPanelEdgeStates(panelId: string): PanelEdgeState[] {
  const context = getEdgeRuleContext(panelId);
  if (!context) return [];

  const cabinet = useCabinetStore.getState().cabinet;
  if (!cabinet) return [];

  const panel = cabinet.panels.find((p) => p.id === panelId);
  if (!panel) return [];

  const sides: EdgeSide[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
  const edgeKeyMap: Record<EdgeSide, keyof typeof panel.edges> = {
    TOP: 'top',
    BOTTOM: 'bottom',
    LEFT: 'left',
    RIGHT: 'right',
  };

  return sides.map((side) => {
    const edgeKey = edgeKeyMap[side];
    const hasPolicy = panel.edges[edgeKey] !== null;
    const exposed = context.adjacency[side] === 'EXPOSED';

    return {
      side,
      exposed,
      policyMode: hasPolicy ? 'MANUAL' : (exposed ? 'AUTO' : 'NONE'),
      policy: hasPolicy ? createPolicyFromEdgeId(panel.edges[edgeKey]!) : undefined,
    };
  });
}

/**
 * Create edge policy from edge material ID
 */
function createPolicyFromEdgeId(edgeId: string): EdgePolicy {
  // Map common edge IDs to policies
  // In production, this would lookup from material registry
  const policies: Record<string, EdgePolicy> = {
    ABS_1MM_WHITE: { sku: 'ABS_1MM_WHITE', thicknessMm: 1.0, heightMm: 22 },
    ABS_2MM_WHITE: { sku: 'ABS_2MM_WHITE', thicknessMm: 2.0, heightMm: 22 },
    ABS_1MM_BLACK: { sku: 'ABS_1MM_BLACK', thicknessMm: 1.0, heightMm: 22 },
    PVC_0_4MM: { sku: 'PVC_0_4MM', thicknessMm: 0.4, heightMm: 22 },
  };

  return policies[edgeId] || { ...DEFAULT_EDGE_POLICY, sku: edgeId };
}

/**
 * Get edges that need policy (exposed but no policy)
 */
export function getEdgesNeedingPolicy(panelId: string): EdgeSide[] {
  const states = getPanelEdgeStates(panelId);
  return states
    .filter((s) => s.exposed && !s.policy)
    .map((s) => s.side);
}

// ============================================
// APPLY EDGE RULES
// ============================================

/**
 * Apply edge rules to cabinet panels
 *
 * This function:
 * 1. Analyzes each panel to determine exposed edges
 * 2. Applies default edge policy to exposed edges without policy
 * 3. Records all applied policies
 *
 * @param input - Input parameters
 * @returns Result with applied policies
 *
 * @example
 * ```ts
 * // Apply to all panels
 * const result = applyEdgeRules({ cabinetId: 'cab-123' });
 *
 * // Apply with custom default SKU
 * const result = applyEdgeRules({
 *   cabinetId: 'cab-123',
 *   defaultEdgeSku: 'ABS_2MM_WHITE',
 * });
 *
 * // Apply to specific panels
 * const result = applyEdgeRules({
 *   cabinetId: 'cab-123',
 *   panelIds: ['panel-1', 'panel-2'],
 * });
 * ```
 */
export function applyEdgeRules(input: ApplyEdgeRulesInput): ApplyEdgeRulesResult {
  const { cabinetId, panelIds, defaultEdgeSku } = input;

  const store = useCabinetStore.getState();
  const cabinet = store.cabinet;

  if (!cabinet || cabinet.id !== cabinetId) {
    return {
      success: false,
      changes: [],
      updatedPanels: [],
      appliedPolicies: [],
      warnings: ['Cabinet not found'],
    };
  }

  const defaultPolicy: EdgePolicy = defaultEdgeSku
    ? { ...DEFAULT_EDGE_POLICY, sku: defaultEdgeSku }
    : DEFAULT_EDGE_POLICY;

  const targetPanels = panelIds
    ? cabinet.panels.filter((p) => panelIds.includes(p.id))
    : cabinet.panels;

  const updatedPanels: string[] = [];
  const appliedPolicies: ApplyEdgeRulesResult['appliedPolicies'] = [];
  const warnings: string[] = [];

  for (const panel of targetPanels) {
    const context = getEdgeRuleContext(panel.id);
    if (!context) {
      warnings.push(`Could not get edge context for panel ${panel.id}`);
      continue;
    }

    const sides: EdgeSide[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
    const edgeKeyMap: Record<EdgeSide, keyof typeof panel.edges> = {
      TOP: 'top',
      BOTTOM: 'bottom',
      LEFT: 'left',
      RIGHT: 'right',
    };

    let panelUpdated = false;

    for (const side of sides) {
      const edgeKey = edgeKeyMap[side];
      const isExposed = context.adjacency[side] === 'EXPOSED';
      const hasPolicy = panel.edges[edgeKey] !== null;

      // Apply policy to exposed edges without policy
      if (isExposed && !hasPolicy) {
        // Update panel edge
        store.updatePanelEdge(panel.id, edgeKey, defaultPolicy.sku);

        appliedPolicies.push({
          panelId: panel.id,
          side,
          policy: defaultPolicy,
        });

        panelUpdated = true;
      }
    }

    if (panelUpdated) {
      updatedPanels.push(panel.id);
    }
  }

  return {
    success: true,
    changes: appliedPolicies.map((p) => ({
      type: 'EDGE_POLICY_APPLIED',
      description: `Applied ${p.policy.sku} to ${p.panelId}:${p.side}`,
    })),
    updatedPanels,
    appliedPolicies,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

// ============================================
// SET PANEL EDGE POLICY
// ============================================

/**
 * Set edge policy for a specific panel edge
 *
 * @param input - Input parameters
 * @returns Edit result
 *
 * @example
 * ```ts
 * // Set manual policy
 * const result = setPanelEdgePolicy({
 *   panelId: 'panel-123',
 *   side: 'LEFT',
 *   mode: 'MANUAL',
 *   policy: { sku: 'ABS_2MM_BLACK', thicknessMm: 2.0 },
 * });
 *
 * // Remove edge policy
 * const result = setPanelEdgePolicy({
 *   panelId: 'panel-123',
 *   side: 'LEFT',
 *   mode: 'NONE',
 * });
 * ```
 */
export function setPanelEdgePolicy(input: SetPanelEdgePolicyInput): EditResult {
  const { panelId, side, mode, policy } = input;

  const store = useCabinetStore.getState();
  const cabinet = store.cabinet;

  if (!cabinet) {
    return {
      success: false,
      changes: [],
      warnings: ['No cabinet loaded'],
    };
  }

  const panel = cabinet.panels.find((p) => p.id === panelId);
  if (!panel) {
    return {
      success: false,
      changes: [],
      warnings: [`Panel ${panelId} not found`],
    };
  }

  const edgeKeyMap: Record<EdgeSide, keyof typeof panel.edges> = {
    TOP: 'top',
    BOTTOM: 'bottom',
    LEFT: 'left',
    RIGHT: 'right',
  };

  const edgeKey = edgeKeyMap[side];
  const oldValue = panel.edges[edgeKey];

  // Validate mode/policy combination
  if (mode === 'MANUAL' && !policy) {
    return {
      success: false,
      changes: [],
      warnings: ['Policy required for MANUAL mode'],
    };
  }

  // Apply the change
  if (mode === 'NONE') {
    store.updatePanelEdge(panelId, edgeKey, null);
  } else if (mode === 'MANUAL' && policy) {
    store.updatePanelEdge(panelId, edgeKey, policy.sku);
  } else if (mode === 'AUTO') {
    // Auto mode uses default policy for exposed edges
    const context = getEdgeRuleContext(panelId);
    if (context?.adjacency[side] === 'EXPOSED') {
      store.updatePanelEdge(panelId, edgeKey, DEFAULT_EDGE_POLICY.sku);
    } else {
      store.updatePanelEdge(panelId, edgeKey, null);
    }
  }

  const newValue = mode === 'NONE' ? null : (policy?.sku || DEFAULT_EDGE_POLICY.sku);

  return {
    success: true,
    changes: [{
      type: 'EDGE_POLICY_SET',
      description: `Set ${panelId}:${side} from ${oldValue || 'NONE'} to ${newValue || 'NONE'}`,
    }],
  };
}

// ============================================
// RECOMMENDED POLICY
// ============================================

/**
 * Get recommended edge policy for a panel edge
 *
 * @param panelId - Panel ID
 * @param side - Edge side
 * @returns Recommended policy or null if edge should not have policy
 */
export function getRecommendedPolicy(
  panelId: string,
  side: EdgeSide
): EdgePolicy | null {
  const context = getEdgeRuleContext(panelId);
  if (!context) return null;

  // Check if edge is exposed
  if (context.adjacency[side] !== 'EXPOSED') {
    return null;
  }

  // For front-facing panels (doors, drawer fronts), recommend 2mm edge
  if (context.isFrontFacing) {
    return {
      sku: 'ABS_2MM_MATCH',
      thicknessMm: 2.0,
      allowanceMm: 0.5,
      heightMm: 22,
    };
  }

  // For other exposed edges, recommend 1mm edge
  return DEFAULT_EDGE_POLICY;
}

// ============================================
// BULK OPERATIONS
// ============================================

/**
 * Get all panels with missing edge policies
 *
 * @param cabinetId - Cabinet ID
 * @returns Array of panel IDs with edges needing policy
 */
export function getPanelsWithMissingEdgePolicies(cabinetId: string): string[] {
  const cabinet = useCabinetStore.getState().cabinet;
  if (!cabinet || cabinet.id !== cabinetId) return [];

  const panelsWithIssues: string[] = [];

  for (const panel of cabinet.panels) {
    const edgesNeeding = getEdgesNeedingPolicy(panel.id);
    if (edgesNeeding.length > 0) {
      panelsWithIssues.push(panel.id);
    }
  }

  return panelsWithIssues;
}

/**
 * Clear all edge policies from a panel
 *
 * @param panelId - Panel ID
 * @returns Edit result
 */
export function clearPanelEdgePolicies(panelId: string): EditResult {
  const sides: EdgeSide[] = ['TOP', 'BOTTOM', 'LEFT', 'RIGHT'];
  const changes: EditResult['changes'] = [];

  for (const side of sides) {
    const result = setPanelEdgePolicy({
      panelId,
      side,
      mode: 'NONE',
    });

    if (result.success) {
      changes.push(...result.changes);
    }
  }

  return {
    success: true,
    changes,
  };
}

/**
 * Copy edge policies from one panel to another
 *
 * @param fromPanelId - Source panel ID
 * @param toPanelId - Target panel ID
 * @returns Edit result
 */
export function copyEdgePolicies(
  fromPanelId: string,
  toPanelId: string
): EditResult {
  const states = getPanelEdgeStates(fromPanelId);
  if (states.length === 0) {
    return {
      success: false,
      changes: [],
      warnings: [`Source panel ${fromPanelId} not found`],
    };
  }

  const changes: EditResult['changes'] = [];

  for (const state of states) {
    const result = setPanelEdgePolicy({
      panelId: toPanelId,
      side: state.side,
      mode: state.policyMode,
      policy: state.policy,
    });

    if (result.success) {
      changes.push(...result.changes);
    }
  }

  return {
    success: true,
    changes,
  };
}
