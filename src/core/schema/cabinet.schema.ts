/**
 * cabinet.schema.ts - Zod Schema for Cabinet Validation
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 * This schema validates Cabinet data from external sources:
 * - localStorage
 * - JSON import
 * - API responses
 * - Deep links
 *
 * @version 1.0.0
 */

import { z } from 'zod';

// ============================================
// ENUMS & CONSTANTS
// ============================================

export const CabinetTypeSchema = z.enum(['BASE', 'WALL', 'TALL', 'DRAWER', 'CORNER']);

export const JointTypeSchema = z.enum(['INSET', 'OVERLAY']);

export const PanelRoleSchema = z.enum([
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
]);

export const GrainDirectionSchema = z.enum(['HORIZONTAL', 'VERTICAL']);

export const BackPanelConstructionSchema = z.enum(['inset', 'overlay']);

export const DrawerSlideTypeSchema = z.enum(['undermount', 'side_mount']);

export const DrawerHandleTypeSchema = z.enum(['pull', 'knob', 'j-pull', 'none']);

export const DrawerHandlePositionSchema = z.enum(['center', 'top', 'bottom']);

export const DoorOverlayTypeSchema = z.enum(['full', 'half', 'inset']);

export const DoorOpeningDirectionSchema = z.enum(['left', 'right']);

export const DoorStyleTypeSchema = z.enum(['slab', 'shaker', 'shaker_modern', 'j_pull']);

export const DoorHandleTypeSchema = z.enum(['pull', 'knob', 'j_pull', 'push_latch', 'none']);

// ============================================
// MATERIAL SCHEMAS
// ============================================

export const CoreMaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  thickness: z.number().positive(),
  costPerSqm: z.number().nonnegative(),
  co2PerSqm: z.number().nonnegative(),
});

export const SurfaceMaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  thickness: z.number().nonnegative(),
  costPerSqm: z.number().nonnegative(),
  co2PerSqm: z.number().nonnegative(),
  color: z.string(),
  textureUrl: z.string().optional(),
});

export const EdgeMaterialSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string(),
  thickness: z.number().positive(),
  height: z.number().positive(),
  costPerMeter: z.number().nonnegative(),
  color: z.string(),
});

// ============================================
// PANEL SCHEMAS
// ============================================

export const PanelEdgesSchema = z.object({
  top: z.string().nullable(),
  bottom: z.string().nullable(),
  left: z.string().nullable(),
  right: z.string().nullable(),
});

export const PanelFacesSchema = z.object({
  faceA: z.string().nullable(),
  faceB: z.string().nullable(),
});

export const PanelComputedSchema = z.object({
  realThickness: z.number().positive(),
  cutWidth: z.number().positive(),
  cutHeight: z.number().positive(),
  surfaceArea: z.number().nonnegative(),
  edgeLength: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  co2: z.number().nonnegative(),
});

export const PanelPositionOverridesSchema = z.object({
  frontSetback: z.number().nonnegative(),
  backSetback: z.number().nonnegative(),
  gapFromBelow: z.number().nullable(),
});

export const CabinetPanelSchema = z.object({
  id: z.string().min(1),
  role: PanelRoleSchema,
  name: z.string(),
  finishWidth: z.number().positive(),
  finishHeight: z.number().positive(),
  coreMaterialId: z.string().min(1),
  faces: PanelFacesSchema,
  edges: PanelEdgesSchema,
  grainDirection: GrainDirectionSchema,
  computed: PanelComputedSchema,
  position: z.tuple([z.number(), z.number(), z.number()]),
  rotation: z.tuple([z.number(), z.number(), z.number()]),
  visible: z.boolean(),
  selected: z.boolean(),
  positionOverrides: PanelPositionOverridesSchema.optional(),
  useCustomPosition: z.boolean().optional(),
  /**
   * Run this panel belongs to, for RUN-level parts (WORKTOP slabs).
   * Declared here as well as on the type because z.object() strips unknown
   * keys — omitting it would silently drop the tag on every parse, which is
   * what per-cabinet cost consumers need in order to exclude hosted slabs.
   */
  runId: z.string().optional(),
});

// ============================================
// DRAWER CONFIGURATION SCHEMAS
// ============================================

export const DrawerRowConfigSchema = z.object({
  id: z.string().min(1),
  frontHeight: z.number().positive(),
  boxHeight: z.number().positive().optional(),
  gapAbove: z.number().nonnegative(),
  slideSystemId: z.string(),
  handleConfig: z.object({
    type: DrawerHandleTypeSchema,
    position: DrawerHandlePositionSchema,
    offsetY: z.number().optional(),
  }).optional(),
});

export const DrawerBoxMaterialsSchema = z.object({
  sideThickness: z.number().positive(),
  backThickness: z.number().positive(),
  bottomThickness: z.number().positive(),
  sideCore: z.string(),
  bottomCore: z.string(),
});

export const DrawerConfigSchema = z.object({
  hasDrawers: z.boolean(),
  rows: z.array(DrawerRowConfigSchema),
  slideType: DrawerSlideTypeSchema,
  boxMaterials: DrawerBoxMaterialsSchema,
  frontOverlay: z.number().optional(),
});

// ============================================
// DOOR CONFIGURATION SCHEMAS
// ============================================

export const DoorPanelConfigSchema = z.object({
  id: z.string().min(1),
  openingDirection: DoorOpeningDirectionSchema,
  style: DoorStyleTypeSchema,
  overlayType: DoorOverlayTypeSchema,
  handleConfig: z.object({
    type: DoorHandleTypeSchema,
    height: z.number().positive(),
    offset: z.number().optional(),
  }).optional(),
  hingeId: z.string(),
  hingeCount: z.number().int().positive().optional(),
  hingePositions: z.array(z.number()).optional(),
});

export const DoorConfigSchema = z.object({
  hasDoors: z.boolean(),
  doorCount: z.union([z.literal(1), z.literal(2)]),
  doors: z.array(DoorPanelConfigSchema),
  doorThickness: z.number().positive(),
  overlayAmount: z.number().nonnegative(),
  doorGap: z.number().nonnegative(),
  revealGap: z.number().nonnegative(),
});

export const KickboardSetbackDatumSchema = z.enum(['CARCASS', 'FRONT']);

export const KickboardConfigSchema = z.object({
  hasKickboard: z.boolean(),
  setback: z.number().nonnegative().optional(),
  setbackDatum: KickboardSetbackDatumSchema.optional(),
  coreMaterialId: z.string().optional(),
  surfaceMaterialId: z.string().optional(),
});

// ============================================
// CABINET STRUCTURE SCHEMAS
// ============================================

export const CabinetDimensionsSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  depth: z.number().positive(),
  toeKickHeight: z.number().nonnegative(),
});

export const CornerAnglesSchema = z.object({
  topLeft: z.number().min(30).max(150).optional(),
  topRight: z.number().min(30).max(150).optional(),
  bottomLeft: z.number().min(30).max(150).optional(),
  bottomRight: z.number().min(30).max(150).optional(),
});

export const CabinetStructureSchema = z.object({
  topJoint: JointTypeSchema,
  bottomJoint: JointTypeSchema,
  hasBackPanel: z.boolean(),
  backPanelInset: z.number().nonnegative(),
  shelfCount: z.number().int().nonnegative(),
  dividerCount: z.number().int().nonnegative(),
  drawerConfig: DrawerConfigSchema.optional(),
  doorConfig: DoorConfigSchema.optional(),
  kickboardConfig: KickboardConfigSchema.optional(),
  cornerAngles: CornerAnglesSchema.optional(),
});

export const CabinetManufacturingSchema = z.object({
  glueThickness: z.number().nonnegative(),
  preMilling: z.number().nonnegative(),
  grooveDepth: z.number().positive(),
  clearance: z.number().nonnegative(),
  shelfSetbackFront: z.number().nonnegative(),
  backPanelConstruction: BackPanelConstructionSchema,
  backVoid: z.number().nonnegative(),
  backThickness: z.number().positive(),
  safetyGap: z.number().nonnegative(),
});

// Materials map with special handling for Map type
export const CabinetMaterialsSchema = z.object({
  defaultCore: z.string(),
  defaultSurface: z.string(),
  defaultEdge: z.string(),
  // Map serializes as object in JSON
  overrides: z.record(z.string(), z.string()).or(z.any()),
});

export const CabinetComputedSchema = z.object({
  totalCost: z.number().nonnegative(),
  totalCO2: z.number().nonnegative(),
  panelCount: z.number().int().nonnegative(),
  totalSurfaceArea: z.number().nonnegative(),
  totalEdgeLength: z.number().nonnegative(),
});

// ============================================
// HARDWARE SCHEMAS
// ============================================

export const MinifixConfigSchema = z.object({
  camDia: z.number().positive(),
  camDepth: z.number().positive(),
  camOffset: z.number(),
  sleeveDia: z.number().positive(),
  sleeveLength: z.number().positive(),
  sleeveOffset: z.number(),
  shaftDia: z.number().positive(),
  shaftLength: z.number().positive(),
  shaftOffset: z.number(),
  ballHeadDia: z.number().positive(),
  ballHeadOffset: z.number(),
  dowelDia: z.number().positive(),
  dowelLength: z.number().positive(),
  dowelOffset: z.number(),
  woodThickness: z.number().positive(),
});

export const HingeConfigSchema = z.object({
  cupDia: z.number().positive(),
  cupDepth: z.number().positive(),
  openingAngle: z.number().positive(),
  softClose: z.boolean(),
});

export const ShelfPinConfigSchema = z.object({
  diameter: z.number().positive(),
  depth: z.number().positive(),
  rowCount: z.number().int().positive(),
  columnCount: z.number().int().positive(),
});

export const CabinetHardwareSchema = z.object({
  minifixPresetId: z.string().optional(),
  minifixConfig: MinifixConfigSchema.optional(),
  hingePresetId: z.string().optional(),
  hingeConfig: HingeConfigSchema.optional(),
  drawerSlidePresetId: z.string().optional(),
  shelfPinConfig: ShelfPinConfigSchema.optional(),
});

export const HardwareRotationOverrideSchema = z.object({
  rotX: z.number(),
  rotY: z.number(),
  rotZ: z.number(),
});

export const HardwarePositionOverrideSchema = z.object({
  dx: z.number(),
  dy: z.number(),
  dz: z.number(),
});

export const HardwarePreviewStateSchema = z.object({
  flipVertical: z.boolean().optional(),
  flipHorizontal: z.boolean().optional(),
  rotationX: z.number().optional(),
  rotationY: z.number().optional(),
  rotationZ: z.number().optional(),
});

export const HardwarePointOverrideSchema = z.object({
  rotation: HardwareRotationOverrideSchema.optional(),
  position: HardwarePositionOverrideSchema.optional(),
  previewState: HardwarePreviewStateSchema.optional(),
});

export const HardwarePointOverridesSchema = z.record(z.string(), HardwarePointOverrideSchema);

// ============================================
// MAIN CABINET SCHEMA
// ============================================

export const CabinetSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: CabinetTypeSchema,
  dimensions: CabinetDimensionsSchema,
  structure: CabinetStructureSchema,
  materials: CabinetMaterialsSchema,
  manufacturing: CabinetManufacturingSchema,
  hardware: CabinetHardwareSchema.optional(),
  hardwareOverrides: HardwarePointOverridesSchema.optional(),
  panels: z.array(CabinetPanelSchema),
  computed: CabinetComputedSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

// ============================================
// TYPE EXPORTS (Inferred from schemas)
// ============================================

export type CabinetSchemaType = z.infer<typeof CabinetSchema>;
export type CabinetPanelSchemaType = z.infer<typeof CabinetPanelSchema>;
export type CabinetDimensionsSchemaType = z.infer<typeof CabinetDimensionsSchema>;
export type CabinetStructureSchemaType = z.infer<typeof CabinetStructureSchema>;
