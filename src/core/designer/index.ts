/**
 * Designer Module - Intent-to-Factory Translation
 *
 * The "brain" of the Designer that translates user intent
 * into manufacturable cabinet specifications.
 *
 * Pipeline: DesignerIntent → [Validate] → [Hardware] → [Drill] → [Assemble] → DesignerOutput
 *
 * v1.0: Initial implementation
 */

// ============================================
// TYPE EXPORTS
// ============================================

export type {
  // Intent types
  DesignerIntent,
  ShelfIntent,
  DividerIntent,
  DoorIntent,
  DrawerIntent,
  DrawerRowIntent,
  ConnectorIntent,
  MaterialPreferences,

  // Issue types
  DesignerIssue,
  DesignerIssueSeverity,

  // Output types
  DesignerOutput,
  DesignerValidation,
  DesignerMetrics,
  HardwareSelection,
  HardwarePlacement,
  AssemblySequence,
  AssemblyStep,
  BOMItem,
  Vec3,

  // Rule types
  DesignerRule,
  RuleCategory,
  RuleRegistryEntry,
} from './types';

// ============================================
// POLICY EXPORTS
// ============================================

export {
  DESIGNER_POLICY,
  DIMENSION_LIMITS,
  MATERIAL_LIMITS,
  SHELF_LIMITS,
  DOOR_LIMITS,
  DRAWER_LIMITS,
  CONNECTOR_LIMITS,
  SYSTEM_32,
  ASSEMBLY_TIMING,
  createDefaultIntent,
  getRequiredHingeCount,
  getMaxShelfSpan,
  getMinThicknessForConnector,
  isAlignedToSystem32,
  getNearestSystem32Position,
} from './policy';

// ============================================
// RULE EXPORTS
// ============================================

export {
  registerRule,
  registerRules,
  enableRule,
  disableRule,
  validateIntent,
  initializeRules,
  clearRules,
  getAllRuleDefinitions,
  STRUCTURAL_RULES,
  DOOR_RULES,
  SHELF_RULES,
  DRAWER_RULES,
} from './rules';

// ============================================
// TRANSFORM EXPORTS
// ============================================

export {
  intentToHardware,
  intentToAssembly,
  intentToDrilling,
  getDrillMapSummary,
} from './transform';

// ============================================
// IMPORTS FOR MAIN PIPELINE
// ============================================

import type {
  DesignerIntent,
  DesignerOutput,
  DesignerValidation,
  DesignerMetrics,
  BOMItem,
  HardwareSelection,
} from './types';

import { initializeRules, validateIntent } from './rules';
import { intentToHardware } from './transform/intentToHardware';
import { intentToAssembly } from './transform/intentToAssembly';
import { intentToDrilling, getDrillMapSummary } from './transform/intentToDrilling';

// ============================================
// INITIALIZATION
// ============================================

// Auto-initialize rules on module load
let rulesInitialized = false;

function ensureRulesInitialized(): void {
  if (!rulesInitialized) {
    initializeRules();
    rulesInitialized = true;
  }
}

// ============================================
// BOM GENERATION
// ============================================

/**
 * Generate Bill of Materials from intent and hardware.
 */
function generateBOM(
  intent: DesignerIntent,
  hardware: HardwareSelection[]
): BOMItem[] {
  const bom: BOMItem[] = [];
  const thickness = intent.materials.carcassThickness;

  // Panels
  const panels = [
    { id: 'left-side', name: 'Left Side Panel', w: intent.dimensions.depth, h: intent.dimensions.height },
    { id: 'right-side', name: 'Right Side Panel', w: intent.dimensions.depth, h: intent.dimensions.height },
    { id: 'top', name: 'Top Panel', w: intent.dimensions.width - thickness * 2, h: intent.dimensions.depth },
    { id: 'bottom', name: 'Bottom Panel', w: intent.dimensions.width - thickness * 2, h: intent.dimensions.depth },
  ];

  // Back panel
  if (intent.backPanel.enabled) {
    panels.push({
      id: 'back',
      name: 'Back Panel',
      w: intent.dimensions.width - thickness * 2,
      h: intent.dimensions.height - thickness * 2,
    });
  }

  // Shelves
  for (const shelf of intent.shelves) {
    panels.push({
      id: `shelf-${shelf.id}`,
      name: `${shelf.type === 'fixed' ? 'Fixed' : 'Adjustable'} Shelf`,
      w: intent.dimensions.width - thickness * 2,
      h: intent.dimensions.depth * (shelf.depthRatio ?? 1),
    });
  }

  // Dividers
  for (const divider of intent.dividers) {
    panels.push({
      id: `divider-${divider.id}`,
      name: 'Vertical Divider',
      w: intent.dimensions.depth,
      h: divider.fullHeight ? intent.dimensions.height - thickness * 2 : intent.dimensions.height / 2,
    });
  }

  // Doors
  if (intent.doors?.enabled) {
    const doorWidth = (intent.dimensions.width - thickness * 2) / intent.doors.count;
    const doorHeight = intent.dimensions.height - (intent.dimensions.toeKickHeight ?? 0);

    for (let i = 0; i < intent.doors.count; i++) {
      panels.push({
        id: `door-${i}`,
        name: `Door ${i + 1}`,
        w: doorWidth,
        h: doorHeight,
      });
    }
  }

  // Add panels to BOM
  for (const panel of panels) {
    bom.push({
      type: 'panel',
      id: panel.id,
      name: panel.name,
      quantity: 1,
      unit: 'pcs',
      dimensions: {
        length: panel.w,
        width: panel.h,
        thickness: panel.id === 'back' ? intent.backPanel.thickness : thickness,
      },
    });
  }

  // Hardware
  for (const hw of hardware) {
    bom.push({
      type: 'hardware',
      id: hw.catalogId,
      name: hw.name,
      quantity: hw.quantity,
      unit: 'pcs',
    });
  }

  // Edge banding (if enabled)
  if (intent.materials.edgeBanding !== 'none') {
    // Calculate total edge length (simplified)
    const totalEdge = panels.reduce((sum, p) => sum + (p.w + p.h) * 2, 0);

    bom.push({
      type: 'edge',
      id: `edge-${intent.materials.edgeBanding}`,
      name: `${intent.materials.edgeBanding.toUpperCase()} Edge Banding`,
      quantity: Math.ceil(totalEdge / 1000), // Convert to meters
      unit: 'm',
    });
  }

  return bom;
}

/**
 * Calculate output metrics.
 */
function calculateMetrics(
  intent: DesignerIntent,
  hardware: HardwareSelection[],
  bom: BOMItem[],
  drillCount: number,
  assemblyMinutes: number
): DesignerMetrics {
  const panelItems = bom.filter((item) => item.type === 'panel');
  const hardwareItems = bom.filter((item) => item.type === 'hardware');

  // Calculate total surface area
  const totalSurfaceArea = panelItems.reduce((sum, item) => {
    if (item.dimensions) {
      return sum + (item.dimensions.length * item.dimensions.width) / 1000000; // m²
    }
    return sum;
  }, 0);

  // Calculate total edge length
  const totalEdgeLength = panelItems.reduce((sum, item) => {
    if (item.dimensions) {
      return sum + ((item.dimensions.length + item.dimensions.width) * 2) / 1000; // m
    }
    return sum;
  }, 0);

  return {
    panelCount: panelItems.length,
    hardwareCount: hardwareItems.reduce((sum, item) => sum + item.quantity, 0),
    drillCount,
    estimatedAssemblyMinutes: assemblyMinutes,
    totalSurfaceArea: Math.round(totalSurfaceArea * 100) / 100,
    totalEdgeLength: Math.round(totalEdgeLength * 100) / 100,
  };
}

// ============================================
// MAIN PIPELINE
// ============================================

/**
 * Process a designer intent and generate factory-ready output.
 *
 * This is the main entry point for the Designer Module.
 * It validates the intent, selects hardware, generates drilling patterns,
 * and creates an assembly sequence.
 *
 * @param intent - The designer's intent for the cabinet
 * @returns Factory-ready output with validation, hardware, drilling, and assembly
 */
export function processDesignerIntent(intent: DesignerIntent): DesignerOutput {
  // Ensure rules are registered
  ensureRulesInitialized();

  // 1. Validate intent
  const validation: DesignerValidation = validateIntent(intent);

  // 2. If blockers exist, return early with empty output
  if (!validation.ok) {
    return {
      validation,
      hardware: [],
      assembly: { steps: [], totalTimeMinutes: 0 },
      bom: [],
      metrics: {
        panelCount: 0,
        hardwareCount: 0,
        drillCount: 0,
        estimatedAssemblyMinutes: 0,
      },
      generatedAt: new Date().toISOString(),
    };
  }

  // 3. Select hardware
  const hardware = intentToHardware(intent);

  // 4. Generate drill map
  const drillMap = intentToDrilling(intent, hardware);
  const drillSummary = getDrillMapSummary(drillMap);

  // 5. Generate assembly sequence
  const assembly = intentToAssembly(intent, hardware);

  // 6. Generate BOM
  const bom = generateBOM(intent, hardware);

  // 7. Calculate metrics
  const metrics = calculateMetrics(
    intent,
    hardware,
    bom,
    drillSummary.totalDrills,
    assembly.totalTimeMinutes
  );

  return {
    validation,
    hardware,
    drillMapRef: `drillmap-${drillMap.cabinetId}`,
    assembly,
    bom,
    metrics,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Validate intent only (without generating full output).
 * Useful for real-time validation feedback.
 */
export function validateDesignerIntent(intent: DesignerIntent): DesignerValidation {
  ensureRulesInitialized();
  return validateIntent(intent);
}

/**
 * Get quick metrics estimate without full processing.
 * Useful for preview/estimation UI.
 */
export function estimateMetrics(intent: DesignerIntent): Partial<DesignerMetrics> {
  // Quick panel count estimate
  let panelCount = 4; // Base structure: left, right, top, bottom
  if (intent.backPanel.enabled) panelCount++;
  panelCount += intent.shelves.length;
  panelCount += intent.dividers.length;
  if (intent.doors?.enabled) panelCount += intent.doors.count;
  if (intent.drawers?.enabled) panelCount += intent.drawers.rows.length * 5; // 5 panels per drawer

  // Quick hardware estimate
  let hardwareCount = 8; // Base connectors
  if (intent.doors?.enabled) {
    hardwareCount += intent.doors.count * 3; // Hinges per door
  }
  if (intent.drawers?.enabled) {
    hardwareCount += intent.drawers.rows.length * 2; // Slides per drawer
  }
  hardwareCount += intent.shelves.filter((s) => s.type === 'adjustable').length * 4; // Shelf pins

  return {
    panelCount,
    hardwareCount,
  };
}
