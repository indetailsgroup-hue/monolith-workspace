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
