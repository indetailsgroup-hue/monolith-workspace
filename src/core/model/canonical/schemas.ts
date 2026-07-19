/**
 * Zod Schema Pack v1 - C2: Runtime Validation Schemas
 *
 * NORTH STAR: "No unvalidated external state enters OperationGraph"
 *
 * These schemas provide runtime validation for the Canonical types.
 * They ensure data integrity at the G9 Persistence Gate boundary.
 *
 * FLOW:
 *   External JSON → Zod Parse → Canonical Type → Validated<T>
 *
 * @version 1.0.0
 */

import { z } from 'zod';
import {
  CANONICAL_SCHEMA_VERSION,
  SUPPORTED_SCHEMA_VERSIONS,
  type SchemaVersion,
  type CanonicalCabinetType,
  type CanonicalJointType,
  type CanonicalPanelRole,
  type CanonicalGrainDirection,
  type CanonicalBackPanelConstruction,
} from './types';

// ============================================
// CUSTOM REFINEMENTS
// ============================================

/**
 * Positive number refinement (> 0)
 */
const positiveNumber = z.number().positive('Must be positive (> 0)').finite();

/**
 * Non-negative number refinement (>= 0)
 */
const nonNegativeNumber = z.number().nonnegative('Must be non-negative (>= 0)').finite();

/**
 * Non-empty string refinement
 */
const nonEmptyString = z.string().min(1, 'Must not be empty');

/**
 * Canonical ID - non-empty string identifier
 */
export const CanonicalIdSchema = nonEmptyString.describe('Unique identifier');

/**
 * Material reference - non-empty string
 */
export const CanonicalMaterialRefSchema = nonEmptyString.describe('Material reference ID');

// ============================================
// SCHEMA VERSION
// ============================================

export const SchemaVersionSchema = z.enum(
  SUPPORTED_SCHEMA_VERSIONS as unknown as [SchemaVersion, ...SchemaVersion[]]
).describe('Schema version for migration support');

// ============================================
// CANONICAL ENUMS
// ============================================

export const CanonicalCabinetTypeSchema = z.enum([
  'BASE',
  'WALL',
  'TALL',
  'DRAWER',
  'CORNER',
] as const satisfies readonly CanonicalCabinetType[]);

export const CanonicalJointTypeSchema = z.enum([
  'INSET',
  'OVERLAY',
] as const satisfies readonly CanonicalJointType[]);

export const CanonicalPanelRoleSchema = z.enum([
  'LEFT_SIDE',
  'RIGHT_SIDE',
  'TOP',
  'BOTTOM',
  'BACK',
  'SHELF',
  'DIVIDER',
  'KICKBOARD',
  'WORKTOP',
  'FRONT',
  'DRAWER_FRONT',
  'DRAWER_SIDE',
  'DRAWER_BACK',
  'DRAWER_BOTTOM',
  'DOOR',
  'DOOR_LEFT',
  'DOOR_RIGHT',
] as const satisfies readonly CanonicalPanelRole[]);

export const CanonicalGrainDirectionSchema = z.enum([
  'HORIZONTAL',
  'VERTICAL',
] as const satisfies readonly CanonicalGrainDirection[]);

export const CanonicalBackPanelConstructionSchema = z.enum([
  'inset',
  'overlay',
] as const satisfies readonly CanonicalBackPanelConstruction[]);

// ============================================
// CANONICAL DIMENSIONS
// ============================================

export const CanonicalDimensionsSchema = z.object({
  width: positiveNumber.describe('Cabinet width in mm'),
  height: positiveNumber.describe('Cabinet height in mm'),
  depth: positiveNumber.describe('Cabinet depth in mm'),
  toeKickHeight: nonNegativeNumber.describe('Toe kick height in mm'),
}).strict();

// ============================================
// CANONICAL MATERIALS
// ============================================

export const CanonicalCoreMaterialSchema = z.object({
  id: CanonicalIdSchema,
  name: nonEmptyString,
  thickness: positiveNumber.describe('Material thickness in mm'),
  costPerSqm: nonNegativeNumber.describe('Cost per square meter'),
  co2PerSqm: nonNegativeNumber.describe('CO2 emissions per square meter'),
}).strict();

export const CanonicalSurfaceMaterialSchema = z.object({
  id: CanonicalIdSchema,
  name: nonEmptyString,
  thickness: nonNegativeNumber.describe('Surface thickness in mm'),
  costPerSqm: nonNegativeNumber.describe('Cost per square meter'),
  co2PerSqm: nonNegativeNumber.describe('CO2 emissions per square meter'),
  color: nonEmptyString.describe('CSS color value'),
  textureUrl: z.string().optional(),
}).strict();

export const CanonicalEdgeMaterialSchema = z.object({
  id: CanonicalIdSchema,
  name: nonEmptyString,
  code: nonEmptyString.describe('Edge banding code'),
  thickness: positiveNumber.describe('Edge thickness in mm'),
  height: positiveNumber.describe('Edge height in mm'),
  costPerMeter: nonNegativeNumber.describe('Cost per meter'),
  color: nonEmptyString.describe('CSS color value'),
}).strict();

// ============================================
// CANONICAL PANEL
// ============================================

export const CanonicalPanelEdgesSchema = z.object({
  top: CanonicalMaterialRefSchema.nullable(),
  bottom: CanonicalMaterialRefSchema.nullable(),
  left: CanonicalMaterialRefSchema.nullable(),
  right: CanonicalMaterialRefSchema.nullable(),
}).strict();

export const CanonicalPanelFacesSchema = z.object({
  faceA: CanonicalMaterialRefSchema.nullable(),
  faceB: CanonicalMaterialRefSchema.nullable(),
}).strict();

export const CanonicalPanelComputedSchema = z.object({
  realThickness: positiveNumber.describe('Actual thickness after surfaces'),
  cutWidth: positiveNumber.describe('Width to cut'),
  cutHeight: positiveNumber.describe('Height to cut'),
  surfaceArea: nonNegativeNumber.describe('Total surface area in sq mm'),
  edgeLength: nonNegativeNumber.describe('Total edge length in mm'),
  cost: nonNegativeNumber.describe('Panel cost'),
  co2: nonNegativeNumber.describe('Panel CO2 emissions'),
}).strict();

/**
 * 3D position tuple [x, y, z]
 */
export const Vec3TupleSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]).describe('3D position [x, y, z]');

export const CanonicalPanelSchema = z.object({
  id: CanonicalIdSchema,
  role: CanonicalPanelRoleSchema,
  name: nonEmptyString,
  finishWidth: positiveNumber.describe('Finished panel width in mm'),
  finishHeight: positiveNumber.describe('Finished panel height in mm'),
  coreMaterialId: CanonicalMaterialRefSchema,
  faces: CanonicalPanelFacesSchema,
  edges: CanonicalPanelEdgesSchema,
  grainDirection: CanonicalGrainDirectionSchema,
  computed: CanonicalPanelComputedSchema,
  position: Vec3TupleSchema,
  rotation: Vec3TupleSchema,
  visible: z.boolean(),
}).strict();

// ============================================
// CANONICAL STRUCTURE
// ============================================

export const CanonicalStructureSchema = z.object({
  topJoint: CanonicalJointTypeSchema,
  bottomJoint: CanonicalJointTypeSchema,
  hasBackPanel: z.boolean(),
  backPanelInset: nonNegativeNumber.describe('Back panel inset in mm'),
  shelfCount: nonNegativeNumber.int().describe('Number of shelves'),
  dividerCount: nonNegativeNumber.int().describe('Number of dividers'),
}).strict();

export const CanonicalManufacturingSchema = z.object({
  glueThickness: positiveNumber.describe('Glue line thickness in mm'),
  preMilling: nonNegativeNumber.describe('Pre-milling allowance in mm'),
  grooveDepth: positiveNumber.describe('Groove depth in mm'),
  clearance: nonNegativeNumber.describe('Assembly clearance in mm'),
  shelfSetbackFront: nonNegativeNumber.describe('Shelf front setback in mm'),
  backPanelConstruction: CanonicalBackPanelConstructionSchema,
  backVoid: nonNegativeNumber.describe('Back void space in mm'),
  backThickness: positiveNumber.describe('Back panel thickness in mm'),
  safetyGap: nonNegativeNumber.describe('Safety gap in mm'),
}).strict();

export const CanonicalMaterialsSchema = z.object({
  defaultCore: CanonicalMaterialRefSchema,
  defaultSurface: CanonicalMaterialRefSchema,
  defaultEdge: CanonicalMaterialRefSchema,
}).strict();

export const CanonicalComputedSchema = z.object({
  totalCost: nonNegativeNumber.describe('Total cabinet cost'),
  totalCO2: nonNegativeNumber.describe('Total CO2 emissions'),
  panelCount: nonNegativeNumber.int().describe('Number of panels'),
  totalSurfaceArea: nonNegativeNumber.describe('Total surface area'),
  totalEdgeLength: nonNegativeNumber.describe('Total edge length'),
}).strict();

// ============================================
// CANONICAL CABINET
// ============================================

export const CanonicalCabinetSchema = z.object({
  id: CanonicalIdSchema,
  name: nonEmptyString,
  type: CanonicalCabinetTypeSchema,
  dimensions: CanonicalDimensionsSchema,
  structure: CanonicalStructureSchema,
  materials: CanonicalMaterialsSchema,
  manufacturing: CanonicalManufacturingSchema,
  panels: z.array(CanonicalPanelSchema),
  computed: CanonicalComputedSchema,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict();

// ============================================
// CANONICAL PROJECT
// ============================================

export const CanonicalProjectMetaSchema = z.object({
  id: CanonicalIdSchema,
  name: nonEmptyString,
  description: z.string().optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
}).strict();

export const CanonicalMaterialLibrarySchema = z.object({
  cores: z.array(CanonicalCoreMaterialSchema),
  surfaces: z.array(CanonicalSurfaceMaterialSchema),
  edges: z.array(CanonicalEdgeMaterialSchema),
}).strict();

export const CanonicalProjectSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  meta: CanonicalProjectMetaSchema,
  cabinets: z.array(CanonicalCabinetSchema),
  materialLibrary: CanonicalMaterialLibrarySchema,
}).strict();

// ============================================
// INFERRED TYPES (for type safety)
// ============================================

export type ZodCanonicalProject = z.infer<typeof CanonicalProjectSchema>;
export type ZodCanonicalCabinet = z.infer<typeof CanonicalCabinetSchema>;
export type ZodCanonicalPanel = z.infer<typeof CanonicalPanelSchema>;

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Safe parse result type
 */
export type SafeParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

/**
 * Parse raw data through schema and return typed result
 */
export function parseCanonicalProject(data: unknown): SafeParseResult<ZodCanonicalProject> {
  return CanonicalProjectSchema.safeParse(data);
}

export function parseCanonicalCabinet(data: unknown): SafeParseResult<ZodCanonicalCabinet> {
  return CanonicalCabinetSchema.safeParse(data);
}

export function parseCanonicalPanel(data: unknown): SafeParseResult<ZodCanonicalPanel> {
  return CanonicalPanelSchema.safeParse(data);
}

// ============================================
// SCHEMA METADATA
// ============================================

/**
 * Schema pack version
 */
export const SCHEMA_PACK_VERSION = '1.0.0';

/**
 * Get all schemas for introspection
 */
export const schemas = {
  project: CanonicalProjectSchema,
  cabinet: CanonicalCabinetSchema,
  panel: CanonicalPanelSchema,
  dimensions: CanonicalDimensionsSchema,
  structure: CanonicalStructureSchema,
  manufacturing: CanonicalManufacturingSchema,
  materials: CanonicalMaterialsSchema,
  coreMaterial: CanonicalCoreMaterialSchema,
  surfaceMaterial: CanonicalSurfaceMaterialSchema,
  edgeMaterial: CanonicalEdgeMaterialSchema,
} as const;
