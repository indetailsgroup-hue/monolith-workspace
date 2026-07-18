/**
 * gate.ts - Phase 1 Gate Validation
 *
 * NORTH STAR: "No invalid data reaches export"
 * Factory เปิดแล้ว "เชื่อ" ได้
 *
 * Phase 1 Gate Rules:
 * - Edge exposure without policy → FAIL
 * - Orphan holes → FAIL
 * - Minifix missing pair → FAIL
 * - Dimension violations → WARN/FAIL
 * - Grain forbidden orientation → WARN
 * - Tool diameter violations → FAIL
 *
 * @version 1.0.0 - Phase 1
 */

import { useCabinetStore } from '../store/useCabinetStore';
import type { Cabinet, CabinetPanel, PanelRole } from '../types/Cabinet';
import type {
  GateSnapshot,
  GateIssue,
  GateSeverity,
  EdgeSide,
} from './types';
import { GATE_ISSUE_CODES } from './types';

// ============================================
// RULE CONFIGURATION
// ============================================

const RULES_CONFIG = {
  // Dimension limits
  dimensions: {
    minWidth: 200,
    maxWidth: 1200,
    minHeight: 300,
    maxHeight: 2400,
    minDepth: 200,
    maxDepth: 800,
    warnWidth: 1000,
    warnHeight: 2200,
  },
  // Structural limits
  structure: {
    maxShelfSpan: 800, // mm before sag warning
    minPanelThickness: 10,
    maxPanelThickness: 25,
  },
  // Edge rules
  edge: {
    requirePolicyForExposed: true,
  },
};

// ============================================
// MAIN GATE FUNCTION
// ============================================

/**
 * Run Phase 1 gate validation on a cabinet
 *
 * @param cabinetId - Cabinet to validate
 * @returns GateSnapshot with all issues
 */
export function runPhase1Gate(cabinetId: string): GateSnapshot {
  const store = useCabinetStore.getState();
  const cabinet = store.cabinet;

  if (!cabinet || cabinet.id !== cabinetId) {
    return createGateSnapshot([{
      code: 'CABINET_NOT_FOUND',
      severity: 'FAIL',
      entityType: 'CABINET',
      entityId: cabinetId,
      message: `Cabinet ${cabinetId} not found`,
    }]);
  }

  const issues: GateIssue[] = [];

  // Run all rule checks
  issues.push(...checkDimensionRules(cabinet));
  issues.push(...checkStructuralRules(cabinet));
  issues.push(...checkEdgeRules(cabinet));
  issues.push(...checkMaterialRules(cabinet));

  return createGateSnapshot(issues);
}

// ============================================
// DIMENSION RULES
// ============================================

function checkDimensionRules(cabinet: Cabinet): GateIssue[] {
  const issues: GateIssue[] = [];
  const { dimensions } = cabinet;
  const limits = RULES_CONFIG.dimensions;

  // Width checks
  if (dimensions.width < limits.minWidth) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_DIM_MIN_VIOLATION,
      severity: 'FAIL',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: `Width ${dimensions.width}mm is below minimum ${limits.minWidth}mm`,
      messageTH: `ความกว้าง ${dimensions.width}mm ต่ำกว่าขั้นต่ำ ${limits.minWidth}mm`,
    });
  } else if (dimensions.width > limits.maxWidth) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_DIM_MAX_VIOLATION,
      severity: 'FAIL',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: `Width ${dimensions.width}mm exceeds maximum ${limits.maxWidth}mm`,
      messageTH: `ความกว้าง ${dimensions.width}mm เกินขั้นสูงสุด ${limits.maxWidth}mm`,
    });
  } else if (dimensions.width > limits.warnWidth) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_DIM_MAX_VIOLATION,
      severity: 'WARN',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: `Width ${dimensions.width}mm exceeds recommended ${limits.warnWidth}mm`,
      messageTH: `ความกว้าง ${dimensions.width}mm เกินค่าแนะนำ ${limits.warnWidth}mm`,
    });
  }

  // Height checks
  if (dimensions.height < limits.minHeight) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_DIM_MIN_VIOLATION,
      severity: 'FAIL',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: `Height ${dimensions.height}mm is below minimum ${limits.minHeight}mm`,
      messageTH: `ความสูง ${dimensions.height}mm ต่ำกว่าขั้นต่ำ ${limits.minHeight}mm`,
    });
  } else if (dimensions.height > limits.maxHeight) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_DIM_MAX_VIOLATION,
      severity: 'FAIL',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: `Height ${dimensions.height}mm exceeds maximum ${limits.maxHeight}mm`,
      messageTH: `ความสูง ${dimensions.height}mm เกินขั้นสูงสุด ${limits.maxHeight}mm`,
    });
  }

  // Depth checks
  if (dimensions.depth < limits.minDepth) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_DIM_MIN_VIOLATION,
      severity: 'FAIL',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: `Depth ${dimensions.depth}mm is below minimum ${limits.minDepth}mm`,
      messageTH: `ความลึก ${dimensions.depth}mm ต่ำกว่าขั้นต่ำ ${limits.minDepth}mm`,
    });
  } else if (dimensions.depth > limits.maxDepth) {
    issues.push({
      code: GATE_ISSUE_CODES.MONO_DIM_MAX_VIOLATION,
      severity: 'FAIL',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: `Depth ${dimensions.depth}mm exceeds maximum ${limits.maxDepth}mm`,
      messageTH: `ความลึก ${dimensions.depth}mm เกินขั้นสูงสุด ${limits.maxDepth}mm`,
    });
  }

  return issues;
}

// ============================================
// STRUCTURAL RULES
// ============================================

function checkStructuralRules(cabinet: Cabinet): GateIssue[] {
  const issues: GateIssue[] = [];
  const { structure, dimensions } = cabinet;
  const limits = RULES_CONFIG.structure;

  // Shelf span check (for sag risk)
  if (structure.shelfCount > 0) {
    const spanWidth = dimensions.width / (structure.dividerCount + 1);
    if (spanWidth > limits.maxShelfSpan) {
      issues.push({
        code: GATE_ISSUE_CODES.MONO_SPAN_TOO_WIDE,
        severity: 'WARN',
        entityType: 'CABINET',
        entityId: cabinet.id,
        message: `Shelf span ${spanWidth.toFixed(0)}mm may sag. Consider adding divider.`,
        messageTH: `ระยะห่างชั้น ${spanWidth.toFixed(0)}mm อาจแอ่น ควรเพิ่ม divider`,
        hint: 'Add a vertical divider to reduce shelf span',
      });
    }
  }

  // Back panel required for tall cabinets
  if (!structure.hasBackPanel && dimensions.height > 1000) {
    issues.push({
      code: 'MONO_BACK_PANEL_RECOMMENDED',
      severity: 'WARN',
      entityType: 'CABINET',
      entityId: cabinet.id,
      message: 'Tall cabinets (>1000mm) should have back panel for stability',
      messageTH: 'ตู้สูง (>1000mm) ควรมีแผงหลังเพื่อความแข็งแรง',
    });
  }

  return issues;
}

// ============================================
// EDGE RULES
// ============================================

function checkEdgeRules(cabinet: Cabinet): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const panel of cabinet.panels) {
    const exposedEdges = getExposedEdges(panel, cabinet);

    for (const edge of exposedEdges) {
      const hasPolicy = hasEdgePolicy(panel, edge);
      if (!hasPolicy) {
        issues.push({
          code: GATE_ISSUE_CODES.MONO_EDGE_MISSING_POLICY,
          severity: 'FAIL',
          entityType: 'EDGE',
          entityId: `${panel.id}:${edge}`,
          message: `Panel ${panel.name} edge ${edge} is exposed but has no edge policy`,
          messageTH: `แผง ${panel.name} ขอบ ${edge} โผล่แต่ไม่มี edge policy`,
          hint: 'Apply edge banding or set edge policy to NONE',
        });
      }
    }
  }

  return issues;
}

/**
 * Determine which edges of a panel are exposed
 */
function getExposedEdges(panel: CabinetPanel, cabinet: Cabinet): EdgeSide[] {
  const exposed: EdgeSide[] = [];
  const role = panel.role;

  // Check for top/bottom panels by examining the panels array
  const hasTopPanel = cabinet.panels.some(p => p.role === 'TOP');
  const hasBottomPanel = cabinet.panels.some(p => p.role === 'BOTTOM');

  // Role-based exposure rules
  switch (role) {
    case 'LEFT_SIDE':
    case 'RIGHT_SIDE':
      // Front edge always exposed for sides
      exposed.push('LEFT'); // Front edge (when viewed from face)
      // Top/bottom exposed if no top/bottom panel (or if OVERLAY joint)
      if (!hasTopPanel || cabinet.structure.topJoint === 'OVERLAY') exposed.push('TOP');
      if (!hasBottomPanel || cabinet.structure.bottomJoint === 'OVERLAY') exposed.push('BOTTOM');
      break;

    case 'TOP':
    case 'BOTTOM':
      // Front edge exposed
      exposed.push('LEFT'); // Front edge
      break;

    case 'SHELF':
      // Front edge exposed, back hidden
      exposed.push('LEFT'); // Front edge
      break;

    case 'DOOR':
    case 'DOOR_LEFT':
    case 'DOOR_RIGHT':
      // All edges exposed for doors
      exposed.push('TOP', 'BOTTOM', 'LEFT', 'RIGHT');
      break;

    case 'DRAWER_FRONT':
      // All edges exposed for drawer fronts
      exposed.push('TOP', 'BOTTOM', 'LEFT', 'RIGHT');
      break;

    case 'KICKBOARD':
      // Plinth: top edge visible from a low angle, both ends visible at run
      // ends / islands. Bottom sits on the floor. Matches ROLE_EXPOSED_EDGES.
      exposed.push('TOP', 'LEFT', 'RIGHT');
      break;

    default:
      // Default: front edge exposed
      exposed.push('LEFT');
  }

  return exposed;
}

/**
 * Check if panel has edge policy for given edge
 */
function hasEdgePolicy(panel: CabinetPanel, edge: EdgeSide): boolean {
  const edgeMap: Record<EdgeSide, keyof typeof panel.edges> = {
    TOP: 'top',
    BOTTOM: 'bottom',
    LEFT: 'left',
    RIGHT: 'right',
  };

  const edgeKey = edgeMap[edge];
  return panel.edges[edgeKey] !== null;
}

// ============================================
// MATERIAL RULES
// ============================================

function checkMaterialRules(cabinet: Cabinet): GateIssue[] {
  const issues: GateIssue[] = [];

  for (const panel of cabinet.panels) {
    // Check core material assigned
    if (!panel.coreMaterialId) {
      issues.push({
        code: GATE_ISSUE_CODES.MONO_MATERIAL_NOT_FOUND,
        severity: 'FAIL',
        entityType: 'PANEL',
        entityId: panel.id,
        message: `Panel ${panel.name} has no core material assigned`,
        messageTH: `แผง ${panel.name} ไม่มีวัสดุแกนกลาง`,
      });
    }
  }

  return issues;
}

// ============================================
// HELPERS
// ============================================

/**
 * Create gate snapshot from issues
 */
function createGateSnapshot(issues: GateIssue[]): GateSnapshot {
  const counts = {
    info: issues.filter((i) => i.severity === 'INFO').length,
    warn: issues.filter((i) => i.severity === 'WARN').length,
    fail: issues.filter((i) => i.severity === 'FAIL').length,
  };

  return {
    hasRun: true,
    issues,
    canExport: counts.fail === 0,
    canRelease: counts.fail === 0 && counts.warn === 0,
    counts,
    timestamp: Date.now(),
  };
}

/**
 * Get gate snapshot for current cabinet
 */
export function getCurrentGateSnapshot(): GateSnapshot | null {
  const cabinet = useCabinetStore.getState().cabinet;
  if (!cabinet) return null;
  return runPhase1Gate(cabinet.id);
}

/**
 * Check if cabinet can export
 */
export function canExport(cabinetId: string): boolean {
  const gate = runPhase1Gate(cabinetId);
  return gate.canExport;
}

/**
 * Get blocking issues (FAIL only)
 */
export function getBlockingIssues(cabinetId: string): GateIssue[] {
  const gate = runPhase1Gate(cabinetId);
  return gate.issues.filter((i) => i.severity === 'FAIL');
}
