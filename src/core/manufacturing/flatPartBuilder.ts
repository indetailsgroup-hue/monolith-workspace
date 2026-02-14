/**
 * flatPartBuilder.ts - P14A.1 FlatPart Builder
 *
 * Converts cabinet panels to FlatPart for DXF export.
 * Handles edge deduction, composite stack, and feature mapping.
 *
 * @version 0.14.1
 */

import {
  FLAT_PART_VERSION,
  type FlatPart,
  type FlatPartFromPanelInput,
  type OuterContour,
  type DrillFeature,
  type PocketFeature,
  type GrooveFeature,
  type EdgeBand,
  type CompositeStack,
  type MaterialLayer,
  type ManufacturingMeta,
  type EdgeSide,
} from '../types/FlatPart';

// ============================================================================
// Cut Size Calculation
// ============================================================================

/**
 * Calculate cut size from finish size.
 *
 * CutSize = FinishSize - EdgeThickness + PreMill
 *
 * For each edge with banding:
 * - Subtract the edge tape thickness
 * - Add back the pre-mill allowance (for CNC trimming)
 */
function calculateCutSize(
  finishSize: number,
  edgeStart: { thickness: number } | undefined,
  edgeEnd: { thickness: number } | undefined,
  preMill: number
): number {
  let cutSize = finishSize;

  // Subtract edge thicknesses
  if (edgeStart) {
    cutSize -= edgeStart.thickness;
  }
  if (edgeEnd) {
    cutSize -= edgeEnd.thickness;
  }

  // Add pre-mill allowance (typically 0.5-1.0mm per side, so double for both sides)
  cutSize += preMill * 2;

  return Math.round(cutSize * 100) / 100; // Round to 2 decimals
}

// ============================================================================
// Feature Builders
// ============================================================================

function buildDrillFeature(
  op: NonNullable<FlatPartFromPanelInput['operations']>[number],
  index: number
): DrillFeature | null {
  if (op.type !== 'drill_vertical' && op.type !== 'hinge_cup') {
    return null;
  }

  if (op.x === undefined || op.y === undefined || op.diameter === undefined || op.depth === undefined) {
    return null;
  }

  return {
    id: `drill_${index}`,
    x: op.x,
    y: op.y,
    diameter: op.diameter,
    depth: op.depth,
    isThrough: op.isThrough ?? false,
    face: op.face ?? 'A',
    layer: `DRILL_V_${op.diameter}_D${op.depth}`,
    purpose: op.type === 'hinge_cup' ? 'hinge_cup' : 'custom',
  };
}

function buildPocketFeature(
  op: NonNullable<FlatPartFromPanelInput['operations']>[number],
  index: number
): PocketFeature | null {
  if (op.type !== 'pocket') {
    return null;
  }

  if (
    op.x === undefined ||
    op.y === undefined ||
    op.width === undefined ||
    op.height === undefined ||
    op.depth === undefined
  ) {
    return null;
  }

  return {
    id: `pocket_${index}`,
    x: op.x,
    y: op.y,
    width: op.width,
    height: op.height,
    depth: op.depth,
    cornerRadius: op.cornerRadius ?? 0,
    face: op.face ?? 'A',
    layer: `POCKET_D${op.depth}`,
    purpose: 'custom',
  };
}

function buildGrooveFeature(
  op: NonNullable<FlatPartFromPanelInput['operations']>[number],
  index: number
): GrooveFeature | null {
  if (op.type !== 'groove') {
    return null;
  }

  if (
    op.axis === undefined ||
    op.position === undefined ||
    op.start === undefined ||
    op.length === undefined ||
    op.width === undefined ||
    op.depth === undefined
  ) {
    return null;
  }

  return {
    id: `groove_${index}`,
    axis: op.axis,
    position: op.position,
    start: op.start,
    length: op.length,
    width: op.width,
    depth: op.depth,
    face: op.face ?? 'A',
    layer: `SAW_GROOVE_D${op.depth}`,
    purpose: 'custom',
  };
}

// ============================================================================
// Edge Band Builder
// ============================================================================

function buildEdgeBands(
  edges: FlatPartFromPanelInput['panel']['edges']
): EdgeBand[] {
  const bands: EdgeBand[] = [];
  const sides: EdgeSide[] = ['top', 'bottom', 'left', 'right'];

  for (const side of sides) {
    const edge = edges[side];
    if (edge) {
      bands.push({
        side,
        materialId: edge.materialId,
        materialCode: edge.code,
        thickness: edge.thickness,
        height: edge.height,
      });
    }
  }

  return bands;
}

// ============================================================================
// Composite Stack Builder
// ============================================================================

function buildCompositeStack(
  panel: FlatPartFromPanelInput['panel']
): CompositeStack {
  const core: MaterialLayer = {
    type: 'core',
    materialId: panel.coreMaterialId,
    materialName: panel.coreMaterialName,
    thickness: panel.coreThickness,
  };

  let totalThickness = panel.coreThickness;

  const stack: CompositeStack = {
    totalThickness,
    core,
  };

  if (panel.surfaceA) {
    stack.surfaceA = {
      type: 'surface_a',
      materialId: panel.surfaceA.materialId,
      materialName: panel.surfaceA.name,
      thickness: panel.surfaceA.thickness,
    };
    totalThickness += panel.surfaceA.thickness;
  }

  if (panel.surfaceB) {
    stack.surfaceB = {
      type: 'surface_b',
      materialId: panel.surfaceB.materialId,
      materialName: panel.surfaceB.name,
      thickness: panel.surfaceB.thickness,
    };
    totalThickness += panel.surfaceB.thickness;
  }

  stack.totalThickness = totalThickness;

  return stack;
}

// ============================================================================
// Main Builder
// ============================================================================

/**
 * Generate a unique part number.
 */
function generatePartNumber(cabinetId: string, panelRole: string): string {
  const roleCode = panelRole
    .split('_')
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const shortCabinetId = cabinetId.slice(-6).toUpperCase();
  return `${shortCabinetId}-${roleCode}`;
}

/**
 * Build a FlatPart from a cabinet panel.
 *
 * @param input - Panel data and configuration
 * @returns FlatPart ready for DXF export
 */
export function flatPartFromPanel(input: FlatPartFromPanelInput): FlatPart {
  const { panel, cabinetId, preMill, quantity = 1, notes, operations = [] } = input;

  // Calculate cut dimensions
  const cutWidth = calculateCutSize(
    panel.finishWidth,
    panel.edges.left,
    panel.edges.right,
    preMill
  );

  const cutHeight = calculateCutSize(
    panel.finishHeight,
    panel.edges.bottom,
    panel.edges.top,
    preMill
  );

  // Build outer contour
  const outer: OuterContour = {
    type: 'rectangle',
    width: cutWidth,
    height: cutHeight,
  };

  // Build features from operations
  const drills: DrillFeature[] = [];
  const pockets: PocketFeature[] = [];
  const grooves: GrooveFeature[] = [];

  operations.forEach((op, index) => {
    const drill = buildDrillFeature(op, index);
    if (drill) {
      drills.push(drill);
      return;
    }

    const pocket = buildPocketFeature(op, index);
    if (pocket) {
      pockets.push(pocket);
      return;
    }

    const groove = buildGrooveFeature(op, index);
    if (groove) {
      grooves.push(groove);
    }
  });

  // Build edge bands
  const edges = buildEdgeBands(panel.edges);

  // Build composite stack
  const composite = buildCompositeStack(panel);

  // Build manufacturing meta
  const manufacturing: ManufacturingMeta = {
    preMill,
    grainDirection: panel.grainDirection,
    quantity,
    notes,
  };

  // Compute derived values
  const surfaceArea = (cutWidth * cutHeight) / 1_000_000; // m²
  const bandedEdgeLength = edges.reduce((total, edge) => {
    if (edge.side === 'top' || edge.side === 'bottom') {
      return total + cutWidth;
    }
    return total + cutHeight;
  }, 0) / 1000; // m

  const now = new Date().toISOString();

  return {
    version: FLAT_PART_VERSION,

    // Identity
    id: `fp_${panel.id}`,
    name: panel.name,
    partNumber: generatePartNumber(cabinetId, panel.role),

    // Source reference
    sourceType: 'cabinet_panel',
    sourceCabinetId: cabinetId,
    sourcePanelId: panel.id,
    sourcePanelRole: panel.role,

    // Dimensions
    finishWidth: panel.finishWidth,
    finishHeight: panel.finishHeight,
    cutWidth,
    cutHeight,

    // Geometry
    outer,
    inners: [], // No cutouts for standard panels

    // Features
    drills,
    pockets,
    grooves,

    // Materials
    composite,
    edges,

    // Manufacturing
    manufacturing,

    // Computed
    computed: {
      surfaceArea,
      bandedEdgeLength,
      drillCount: drills.length,
    },

    // Timestamps
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build FlatParts for all panels in a cabinet.
 */
export function flatPartsFromCabinet(
  cabinetId: string,
  panels: FlatPartFromPanelInput['panel'][],
  preMill: number,
  operations?: Map<string, FlatPartFromPanelInput['operations']>
): FlatPart[] {
  return panels.map((panel) =>
    flatPartFromPanel({
      panel,
      cabinetId,
      preMill,
      operations: operations?.get(panel.id),
    })
  );
}
