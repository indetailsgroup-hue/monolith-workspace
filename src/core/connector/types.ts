/**
 * Connector OS v1.1 - Type Definitions
 *
 * Brand-agnostic data schemas for the Digital Joinery Compiler.
 * Supports Minifix, Target J10, Rastex, and future connector families.
 *
 * @see docs/connector-os/data-schema.md
 */

// Re-export foundation types
export type { Stack, ManufacturingMode, CncCoordinate } from './calculateCncCoordinate';

// ──────────────────────────────────────────────────────────────────────────────
// Geometry Level: BoreFeature
// ──────────────────────────────────────────────────────────────────────────────

export type Axis = 'U' | 'V' | 'N';
export type RefFrame = 'CORE' | 'FINISHED';
export type RefSurface = 'INNER_FACE' | 'OUTER_FACE';
export type RefEdge = 'JOIN_EDGE' | 'FRONT_EDGE' | 'BACK_EDGE';
export type FeatureRole = 'STRUCTURAL' | 'AUXILIARY';
export type BoreKind = 'FACE_BORE' | 'EDGE_BORE' | 'POCKET';

export interface BoreFeatureTransform {
  type: 'OFFSET_DELTA';
  deltaMm: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// N-Center Policy (Connector OS v1.1)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * N-axis centering base reference.
 *
 * - CORE_CENTER: base = bare board thickness (e.g. 18.0mm HMR)
 * - FINISHED_CENTER: base = finished thickness including surface material (e.g. 19.6mm)
 */
export type NCenterBase = 'CORE_CENTER' | 'FINISHED_CENTER';

/**
 * N-axis centering policy for structural bore features.
 *
 * Separates physical measurement base from engineering intent.
 * Both paths can produce the same CNC output (e.g. N=9.0mm) but
 * encode different semantic models.
 *
 * Example (HMR 18mm + HPL 0.8mm×2 = 19.6mm finished):
 * - Legacy: N = core / 2 = 18.0 / 2 = 9.0mm
 * - Policy: N = (finished / 2) + offset = (19.6 / 2) + (-0.8) = 9.0mm
 *
 * @see Master Specification v1.1 §3.2
 */
export interface NCenterPolicy {
  /** Physical base: CORE_CENTER (bare board) or FINISHED_CENTER (with surface) */
  base: NCenterBase;
  /** Intent offset in mm (e.g. -0.8 to pull center back to core midpoint) */
  offsetMm: number;
}

export interface BoreFeature {
  id: string;
  kind: BoreKind;
  role: FeatureRole;
  diaMm: number;
  depthMm: number;
  refFrame: RefFrame;
  refSurface: RefSurface;
  refEdgePrimary: RefEdge;
  offsetPrimaryMm: number;
  axisPrimary: Axis;
  refEdgeSecondary: RefEdge;
  offsetSecondaryMm: number;
  axisSecondary: Axis;
  transform?: BoreFeatureTransform;
  /** N-axis centering policy (v1.1). Optional for backward compatibility. */
  nCenterPolicy?: NCenterPolicy;
}

// ──────────────────────────────────────────────────────────────────────────────
// Connector Level: ConnectorSpec
// ──────────────────────────────────────────────────────────────────────────────

export type ConnectorFamily = 'MINIFIX' | 'TARGET_J' | 'RASTEX';

export interface ConnectorSpec {
  connectorId: string;
  brand: string;
  family: ConnectorFamily;
  features: BoreFeature[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Placement Policy: ConnectorPlacementProfile
// ──────────────────────────────────────────────────────────────────────────────

export type LoadClass = 'LIGHT' | 'STANDARD' | 'HEAVY';

export interface System32Params {
  firstHole: number;
  pitch: number;
  endOffset: number;
}

export interface PlacementConstraints {
  minPerJoint: number;
  maxSpacingMm: number;
  loadOverrides: Record<LoadClass, { maxSpacingMm: number }>;
}

export interface ConnectorPlacementProfile {
  id: string;
  system32: System32Params;
  constraints: PlacementConstraints;
}

// ──────────────────────────────────────────────────────────────────────────────
// Material Stack: MaterialStackPreset
// ──────────────────────────────────────────────────────────────────────────────

export interface MaterialStackPreset {
  id: string;
  core: { material: string; thickness: number };
  surface: { material: string; thickness: number; sides: number };
  edge: { material: string; thickness: number };
  resolved: {
    coreThk: number;
    finishedThk: number;
    edgeThk: number;
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Edge Banding Map (Connector OS v1.1)
// ──────────────────────────────────────────────────────────────────────────────

/** Edge sides relevant for join/banding analysis */
export type EdgeSideConnector = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';

/**
 * Edge banding map per Connector OS v1.1 spec.
 *
 * Records which edges have edge banding applied and the banding thickness.
 * Used by G11.8 to prevent edge banding on join edges where flush
 * wood-to-wood contact is required for structural connectors.
 *
 * Coexists with existing EdgeBand[] format in FlatPart.ts.
 *
 * @see Master Specification v1.1 §5.2
 */
export interface EdgeBandMap {
  /** Boolean flags for each edge side */
  banded: Record<EdgeSideConnector, boolean>;
  /** Edge band thickness in mm (e.g. 0.4, 1.0, 2.0) */
  bandThkMm: number;
}

// ──────────────────────────────────────────────────────────────────────────────
// Compiler Output: ConnectorDrillOp
// ──────────────────────────────────────────────────────────────────────────────

export interface ConnectorDrillMeta {
  connectorId: string;
  pairId: string;
  featureId: string;
  instanceIndex: number;
  role: FeatureRole;
  frame: RefFrame;
}

export interface ConnectorDrillOp {
  type: 'DRILL';
  params: {
    dia: number;
    depth: number;
    u: number;
    v: number;
    n: number;
  };
  meta: ConnectorDrillMeta;
  tags: string[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Adjacency Context (Compiler Input)
// ──────────────────────────────────────────────────────────────────────────────

export interface AdjacencyContext {
  id: string;
  jointLength: number;
  panelA: { panelId: string; role: string };
  panelB: { panelId: string; role: string };
}
