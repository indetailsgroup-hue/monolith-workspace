/**
 * Canonical Adapters - C1: Conversion between Legacy and Canonical
 *
 * APPROACH: 3C Hybrid
 * - Read from legacy format
 * - Convert to Canonical via validation
 * - Convert back to legacy for store compatibility
 *
 * These adapters allow gradual migration without breaking existing code.
 *
 * @version 1.0.0
 */

import type {
  Cabinet,
  CabinetPanel,
  CabinetType,
  JointType,
  PanelRole,
  GrainDirection,
  CoreMaterial,
  SurfaceMaterial,
  EdgeMaterial,
  CabinetDimensions,
  CabinetStructure,
  CabinetManufacturing,
  CabinetMaterials,
  CabinetComputed,
  PanelEdges,
  PanelFaces,
  PanelComputed,
  BackPanelConstruction,
} from '../../types/Cabinet';

import type {
  CanonicalProject,
  CanonicalCabinet,
  CanonicalPanel,
  CanonicalDimensions,
  CanonicalStructure,
  CanonicalManufacturing,
  CanonicalMaterials,
  CanonicalComputed,
  CanonicalPanelEdges,
  CanonicalPanelFaces,
  CanonicalPanelComputed,
  CanonicalCoreMaterial,
  CanonicalSurfaceMaterial,
  CanonicalEdgeMaterial,
  CanonicalCabinetType,
  CanonicalJointType,
  CanonicalPanelRole,
  CanonicalGrainDirection,
  CanonicalBackPanelConstruction,
  Validated,
  CanonicalId,
  CanonicalMaterialRef,
  PositiveNumber,
  NonNegativeNumber,
  ValidatedProject,
  SchemaVersion,
} from './types';

import { CANONICAL_SCHEMA_VERSION, unsafeMarkAsValidated } from './types';

// ============================================
// PRIMITIVE CONVERSIONS
// ============================================

/**
 * Convert string to CanonicalId (assumes validation passed)
 */
function toCanonicalId(id: string): CanonicalId {
  return unsafeMarkAsValidated(id);
}

/**
 * Convert string to CanonicalMaterialRef (assumes validation passed)
 */
function toMaterialRef(ref: string): CanonicalMaterialRef {
  return unsafeMarkAsValidated(ref);
}

/**
 * Convert number to PositiveNumber (assumes validation passed)
 */
function toPositiveNumber(n: number): PositiveNumber {
  return unsafeMarkAsValidated(n);
}

/**
 * Convert number to NonNegativeNumber (assumes validation passed)
 */
function toNonNegativeNumber(n: number): NonNegativeNumber {
  return unsafeMarkAsValidated(n);
}

// ============================================
// ENUM MAPPINGS
// ============================================

function toCabinetType(type: CabinetType): CanonicalCabinetType {
  return type as CanonicalCabinetType;
}

function fromCabinetType(type: CanonicalCabinetType): CabinetType {
  return type as CabinetType;
}

function toJointType(joint: JointType): CanonicalJointType {
  return joint as CanonicalJointType;
}

function fromJointType(joint: CanonicalJointType): JointType {
  return joint as JointType;
}

function toPanelRole(role: PanelRole): CanonicalPanelRole {
  return role as CanonicalPanelRole;
}

function fromPanelRole(role: CanonicalPanelRole): PanelRole {
  return role as PanelRole;
}

function toGrainDirection(dir: GrainDirection): CanonicalGrainDirection {
  return dir as CanonicalGrainDirection;
}

function fromGrainDirection(dir: CanonicalGrainDirection): GrainDirection {
  return dir as GrainDirection;
}

function toBackPanelConstruction(c: BackPanelConstruction): CanonicalBackPanelConstruction {
  return c as CanonicalBackPanelConstruction;
}

function fromBackPanelConstruction(c: CanonicalBackPanelConstruction): BackPanelConstruction {
  return c as BackPanelConstruction;
}

// ============================================
// MATERIAL CONVERSIONS
// ============================================

export function toCanonicalCoreMaterial(mat: CoreMaterial): CanonicalCoreMaterial {
  return {
    id: toCanonicalId(mat.id),
    name: mat.name,
    thickness: toPositiveNumber(mat.thickness),
    costPerSqm: toNonNegativeNumber(mat.costPerSqm),
    co2PerSqm: toNonNegativeNumber(mat.co2PerSqm),
  };
}

export function fromCanonicalCoreMaterial(mat: CanonicalCoreMaterial): CoreMaterial {
  return {
    id: mat.id as string,
    name: mat.name,
    thickness: mat.thickness as number,
    costPerSqm: mat.costPerSqm as number,
    co2PerSqm: mat.co2PerSqm as number,
  };
}

export function toCanonicalSurfaceMaterial(mat: SurfaceMaterial): CanonicalSurfaceMaterial {
  return {
    id: toCanonicalId(mat.id),
    name: mat.name,
    thickness: toNonNegativeNumber(mat.thickness),
    costPerSqm: toNonNegativeNumber(mat.costPerSqm),
    co2PerSqm: toNonNegativeNumber(mat.co2PerSqm),
    color: mat.color,
    textureUrl: mat.textureUrl,
  };
}

export function fromCanonicalSurfaceMaterial(mat: CanonicalSurfaceMaterial): SurfaceMaterial {
  return {
    id: mat.id as string,
    name: mat.name,
    thickness: mat.thickness as number,
    costPerSqm: mat.costPerSqm as number,
    co2PerSqm: mat.co2PerSqm as number,
    color: mat.color,
    textureUrl: mat.textureUrl,
  };
}

export function toCanonicalEdgeMaterial(mat: EdgeMaterial): CanonicalEdgeMaterial {
  return {
    id: toCanonicalId(mat.id),
    name: mat.name,
    code: mat.code,
    thickness: toPositiveNumber(mat.thickness),
    height: toPositiveNumber(mat.height),
    costPerMeter: toNonNegativeNumber(mat.costPerMeter),
    color: mat.color,
  };
}

export function fromCanonicalEdgeMaterial(mat: CanonicalEdgeMaterial): EdgeMaterial {
  return {
    id: mat.id as string,
    name: mat.name,
    code: mat.code,
    thickness: mat.thickness as number,
    height: mat.height as number,
    costPerMeter: mat.costPerMeter as number,
    color: mat.color,
  };
}

// ============================================
// PANEL CONVERSIONS
// ============================================

function toCanonicalPanelEdges(edges: PanelEdges): CanonicalPanelEdges {
  return {
    top: edges.top ? toMaterialRef(edges.top) : null,
    bottom: edges.bottom ? toMaterialRef(edges.bottom) : null,
    left: edges.left ? toMaterialRef(edges.left) : null,
    right: edges.right ? toMaterialRef(edges.right) : null,
  };
}

function fromCanonicalPanelEdges(edges: CanonicalPanelEdges): PanelEdges {
  return {
    top: edges.top as string | null,
    bottom: edges.bottom as string | null,
    left: edges.left as string | null,
    right: edges.right as string | null,
  };
}

function toCanonicalPanelFaces(faces: PanelFaces): CanonicalPanelFaces {
  return {
    faceA: faces.faceA ? toMaterialRef(faces.faceA) : null,
    faceB: faces.faceB ? toMaterialRef(faces.faceB) : null,
  };
}

function fromCanonicalPanelFaces(faces: CanonicalPanelFaces): PanelFaces {
  return {
    faceA: faces.faceA as string | null,
    faceB: faces.faceB as string | null,
  };
}

function toCanonicalPanelComputed(computed: PanelComputed): CanonicalPanelComputed {
  return {
    realThickness: toPositiveNumber(computed.realThickness),
    cutWidth: toPositiveNumber(computed.cutWidth),
    cutHeight: toPositiveNumber(computed.cutHeight),
    surfaceArea: toNonNegativeNumber(computed.surfaceArea),
    edgeLength: toNonNegativeNumber(computed.edgeLength),
    cost: toNonNegativeNumber(computed.cost),
    co2: toNonNegativeNumber(computed.co2),
  };
}

function fromCanonicalPanelComputed(computed: CanonicalPanelComputed): PanelComputed {
  return {
    realThickness: computed.realThickness as number,
    cutWidth: computed.cutWidth as number,
    cutHeight: computed.cutHeight as number,
    surfaceArea: computed.surfaceArea as number,
    edgeLength: computed.edgeLength as number,
    cost: computed.cost as number,
    co2: computed.co2 as number,
  };
}

export function toCanonicalPanel(panel: CabinetPanel): CanonicalPanel {
  return {
    id: toCanonicalId(panel.id),
    role: toPanelRole(panel.role),
    name: panel.name,
    finishWidth: toPositiveNumber(panel.finishWidth),
    finishHeight: toPositiveNumber(panel.finishHeight),
    coreMaterialId: toMaterialRef(panel.coreMaterialId),
    faces: toCanonicalPanelFaces(panel.faces),
    edges: toCanonicalPanelEdges(panel.edges),
    grainDirection: toGrainDirection(panel.grainDirection),
    computed: toCanonicalPanelComputed(panel.computed),
    position: panel.position as readonly [number, number, number],
    rotation: panel.rotation as readonly [number, number, number],
    visible: panel.visible,
  };
}

export function fromCanonicalPanel(panel: CanonicalPanel): CabinetPanel {
  return {
    id: panel.id as string,
    role: fromPanelRole(panel.role),
    name: panel.name,
    finishWidth: panel.finishWidth as number,
    finishHeight: panel.finishHeight as number,
    coreMaterialId: panel.coreMaterialId as string,
    faces: fromCanonicalPanelFaces(panel.faces),
    edges: fromCanonicalPanelEdges(panel.edges),
    grainDirection: fromGrainDirection(panel.grainDirection),
    computed: fromCanonicalPanelComputed(panel.computed),
    position: [...panel.position] as [number, number, number],
    rotation: [...panel.rotation] as [number, number, number],
    visible: panel.visible,
    selected: false, // Default value
  };
}

// ============================================
// STRUCTURE CONVERSIONS
// ============================================

function toCanonicalDimensions(dims: CabinetDimensions): CanonicalDimensions {
  return {
    width: toPositiveNumber(dims.width),
    height: toPositiveNumber(dims.height),
    depth: toPositiveNumber(dims.depth),
    toeKickHeight: toNonNegativeNumber(dims.toeKickHeight),
  };
}

function fromCanonicalDimensions(dims: CanonicalDimensions): CabinetDimensions {
  return {
    width: dims.width as number,
    height: dims.height as number,
    depth: dims.depth as number,
    toeKickHeight: dims.toeKickHeight as number,
  };
}

function toCanonicalStructure(struct: CabinetStructure): CanonicalStructure {
  return {
    topJoint: toJointType(struct.topJoint),
    bottomJoint: toJointType(struct.bottomJoint),
    hasBackPanel: struct.hasBackPanel,
    backPanelInset: toNonNegativeNumber(struct.backPanelInset),
    shelfCount: toNonNegativeNumber(struct.shelfCount),
    dividerCount: toNonNegativeNumber(struct.dividerCount),
  };
}

function fromCanonicalStructure(struct: CanonicalStructure): CabinetStructure {
  return {
    topJoint: fromJointType(struct.topJoint),
    bottomJoint: fromJointType(struct.bottomJoint),
    hasBackPanel: struct.hasBackPanel,
    backPanelConstruction: 'inset', // Default to inset for canonical imports
    backPanelInset: struct.backPanelInset as number,
    shelfCount: struct.shelfCount as number,
    dividerCount: struct.dividerCount as number,
  };
}

function toCanonicalManufacturing(mfg: CabinetManufacturing): CanonicalManufacturing {
  return {
    glueThickness: toPositiveNumber(mfg.glueThickness),
    preMilling: toNonNegativeNumber(mfg.preMilling),
    grooveDepth: toPositiveNumber(mfg.grooveDepth),
    clearance: toNonNegativeNumber(mfg.clearance),
    shelfSetbackFront: toNonNegativeNumber(mfg.shelfSetbackFront),
    backPanelConstruction: toBackPanelConstruction(mfg.backPanelConstruction),
    backVoid: toNonNegativeNumber(mfg.backVoid),
    backThickness: toPositiveNumber(mfg.backThickness),
    safetyGap: toNonNegativeNumber(mfg.safetyGap),
  };
}

function fromCanonicalManufacturing(mfg: CanonicalManufacturing): CabinetManufacturing {
  return {
    glueThickness: mfg.glueThickness as number,
    preMilling: mfg.preMilling as number,
    grooveDepth: mfg.grooveDepth as number,
    clearance: mfg.clearance as number,
    shelfSetbackFront: mfg.shelfSetbackFront as number,
    backPanelConstruction: fromBackPanelConstruction(mfg.backPanelConstruction),
    backVoid: mfg.backVoid as number,
    backThickness: mfg.backThickness as number,
    safetyGap: mfg.safetyGap as number,
  };
}

function toCanonicalMaterials(mats: CabinetMaterials): CanonicalMaterials {
  return {
    defaultCore: toMaterialRef(mats.defaultCore),
    defaultSurface: toMaterialRef(mats.defaultSurface),
    defaultEdge: toMaterialRef(mats.defaultEdge),
  };
}

function fromCanonicalMaterials(mats: CanonicalMaterials): CabinetMaterials {
  return {
    defaultCore: mats.defaultCore as string,
    defaultSurface: mats.defaultSurface as string,
    defaultEdge: mats.defaultEdge as string,
    overrides: new Map(),
  };
}

function toCanonicalComputed(computed: CabinetComputed): CanonicalComputed {
  return {
    totalCost: toNonNegativeNumber(computed.totalCost),
    totalCO2: toNonNegativeNumber(computed.totalCO2),
    panelCount: toNonNegativeNumber(computed.panelCount),
    totalSurfaceArea: toNonNegativeNumber(computed.totalSurfaceArea),
    totalEdgeLength: toNonNegativeNumber(computed.totalEdgeLength),
  };
}

function fromCanonicalComputed(computed: CanonicalComputed): CabinetComputed {
  return {
    totalCost: computed.totalCost as number,
    totalCO2: computed.totalCO2 as number,
    panelCount: computed.panelCount as number,
    totalSurfaceArea: computed.totalSurfaceArea as number,
    totalEdgeLength: computed.totalEdgeLength as number,
  };
}

// ============================================
// CABINET CONVERSIONS
// ============================================

/**
 * Convert legacy Cabinet to CanonicalCabinet
 * NOTE: This assumes the input has already been validated
 */
export function toCanonicalCabinet(cabinet: Cabinet): CanonicalCabinet {
  return {
    id: toCanonicalId(cabinet.id),
    name: cabinet.name,
    type: toCabinetType(cabinet.type),
    dimensions: toCanonicalDimensions(cabinet.dimensions),
    structure: toCanonicalStructure(cabinet.structure),
    materials: toCanonicalMaterials(cabinet.materials),
    manufacturing: toCanonicalManufacturing(cabinet.manufacturing),
    panels: cabinet.panels.map(toCanonicalPanel),
    computed: toCanonicalComputed(cabinet.computed),
    createdAt: cabinet.createdAt,
    updatedAt: cabinet.updatedAt,
  };
}

/**
 * Convert CanonicalCabinet back to legacy Cabinet
 */
export function fromCanonicalCabinet(cabinet: CanonicalCabinet): Cabinet {
  return {
    id: cabinet.id as string,
    name: cabinet.name,
    type: fromCabinetType(cabinet.type),
    dimensions: fromCanonicalDimensions(cabinet.dimensions),
    structure: fromCanonicalStructure(cabinet.structure),
    materials: fromCanonicalMaterials(cabinet.materials),
    manufacturing: fromCanonicalManufacturing(cabinet.manufacturing),
    panels: cabinet.panels.map(fromCanonicalPanel),
    computed: fromCanonicalComputed(cabinet.computed),
    createdAt: cabinet.createdAt,
    updatedAt: cabinet.updatedAt,
  };
}

// ============================================
// PROJECT CONVERSIONS
// ============================================

/**
 * Convert legacy cabinet and materials to CanonicalProject
 */
export function toCanonicalProject(
  projectId: string,
  projectName: string,
  cabinet: Cabinet,
  materials: {
    cores: CoreMaterial[];
    surfaces: SurfaceMaterial[];
    edges: EdgeMaterial[];
  }
): CanonicalProject {
  const now = Date.now();

  return {
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    meta: {
      id: toCanonicalId(projectId),
      name: projectName,
      createdAt: now,
      updatedAt: now,
    },
    cabinets: [toCanonicalCabinet(cabinet)],
    materialLibrary: {
      cores: materials.cores.map(toCanonicalCoreMaterial),
      surfaces: materials.surfaces.map(toCanonicalSurfaceMaterial),
      edges: materials.edges.map(toCanonicalEdgeMaterial),
    },
  };
}

/**
 * Extract cabinet from ValidatedProject
 */
export function extractCabinetFromProject(project: ValidatedProject): Cabinet | null {
  if (project.cabinets.length === 0) return null;
  return fromCanonicalCabinet(project.cabinets[0]);
}

/**
 * Extract materials from ValidatedProject
 */
export function extractMaterialsFromProject(project: ValidatedProject): {
  cores: CoreMaterial[];
  surfaces: SurfaceMaterial[];
  edges: EdgeMaterial[];
} {
  return {
    cores: project.materialLibrary.cores.map(fromCanonicalCoreMaterial),
    surfaces: project.materialLibrary.surfaces.map(fromCanonicalSurfaceMaterial),
    edges: project.materialLibrary.edges.map(fromCanonicalEdgeMaterial),
  };
}
