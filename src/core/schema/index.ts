/**
 * Schema Module Index - Zod Schema Pack v1
 *
 * GATE RULE (G9): No unvalidated external state enters OperationGraph.
 *
 * This barrel export provides all Zod schemas for validating external data:
 * - Common primitives (Vec3, RGB, dimensions)
 * - Material definitions and overrides
 * - Hardware configurations (discriminated unions)
 * - Panel definitions with role-specific params
 * - Cabinet structure
 * - Project metadata and versioning
 *
 * @version 1.0.0 - Schema Pack v1
 */

// ============================================
// COMMON PRIMITIVES
// ============================================

export {
  // IDs
  IdSchema,

  // Vectors
  Vec3Schema,
  Vec3TupleSchema,

  // Colors
  RgbSchema,
  HexColorSchema,

  // Dates
  IsoDateSchema,
  TimestampSchema,

  // Dimensions
  PositiveMmSchema,
  NonNegativeMmSchema,
  CabinetDimensionSchema,

  // Helpers
  StrictRecord,
  Nullish,
  EmptyArray,

  // Types
  type Vec3,
  type Vec3Tuple,
  type Rgb,
} from './common.schema';

// ============================================
// MATERIALS
// ============================================

export {
  // Kind & Finish
  MaterialKindSchema,
  FinishSchema,
  MaterialTypeSchema,

  // Material definition
  MaterialSchema,
  MaterialRefSchema,
  MaterialIdSchema,

  // Surface overrides
  FaceSchema,
  SurfaceOverrideSchema,

  // Edge banding
  EdgeSideSchema,
  EdgeBandingOverrideSchema,
  EdgeBandingMapSchema,

  // Assignments
  MaterialAssignmentSchema,

  // Types
  type MaterialKind,
  type Finish,
  type MaterialType,
  type Material,
  type MaterialRef,
  type Face,
  type EdgeSide,
  type SurfaceOverride,
  type EdgeBandingOverride,
  type EdgeBandingMap,
  type MaterialAssignment,
} from './material.schema';

// ============================================
// HARDWARE
// ============================================

export {
  // Type discriminator
  HardwareTypeSchema,

  // Config schemas (discriminated union variants)
  MinifixConfigSchema as MinifixConfigSchemaV2,
  CamConfigSchema,
  DowelConfigSchema,
  HingeConfigSchema as HingeConfigSchemaV2,
  ShelfPinConfigSchema as ShelfPinConfigSchemaV2,
  DrawerSlideConfigSchema,
  GenericHardwareConfigSchema,

  // Union type
  HardwareConfigSchema,

  // Instance
  HardwareInstanceSchema,
  HardwarePointOverrideSchema as HardwarePointOverrideSchemaV2,

  // Sub-types
  HingeTypeSchema,
  HingeAngleSchema,
  SlideTypeSchema,

  // Legacy
  LegacyHardwareSettingsSchema,

  // Types
  type HardwareType,
  type MinifixConfig,
  type CamConfig,
  type DowelConfig,
  type HingeConfig,
  type ShelfPinConfig,
  type DrawerSlideConfig,
  type GenericHardwareConfig,
  type HardwareConfig,
  type HardwareInstance,
  type HardwarePointOverride,
} from './hardware.schema';

// ============================================
// PANELS
// ============================================

export {
  // Role
  PanelRoleSchema as PanelRoleSchemaV2,

  // Dimensions
  PanelRectSchema,
  LegacyPanelDimensionsSchema,

  // Base
  PanelBaseSchema,

  // Role-specific params (discriminated union)
  ShelfParamsSchema,
  DividerParamsSchema,
  DoorParamsSchema,
  DrawerFrontParamsSchema,
  GenericPanelParamsSchema,
  PanelParamsSchema,

  // Complete panel
  PanelSchema as PanelSchemaV2,
  PanelComputedSchema as PanelComputedSchemaV2,
  PanelWithComputedSchema,

  // Arrays
  PanelArraySchema,
  PanelWithComputedArraySchema,

  // Types
  type PanelRole,
  type PanelRect,
  type PanelBase,
  type ShelfParams,
  type DividerParams,
  type DoorParams,
  type DrawerFrontParams,
  type PanelParams,
  type Panel,
  type PanelComputed,
  type PanelWithComputed,
} from './panel.schema';

// ============================================
// CABINET (Legacy compatible)
// ============================================

export {
  // Enums
  CabinetTypeSchema,
  JointTypeSchema,
  PanelRoleSchema, // Legacy panel roles
  GrainDirectionSchema,
  BackPanelConstructionSchema,
  DrawerSlideTypeSchema,
  DrawerHandleTypeSchema,
  DrawerHandlePositionSchema,
  DoorOverlayTypeSchema,
  DoorOpeningDirectionSchema,
  DoorStyleTypeSchema,
  DoorHandleTypeSchema,

  // Material schemas (legacy)
  CoreMaterialSchema,
  SurfaceMaterialSchema,
  EdgeMaterialSchema,

  // Panel schemas (legacy)
  PanelEdgesSchema,
  PanelFacesSchema,
  PanelComputedSchema,
  PanelPositionOverridesSchema,
  CabinetPanelSchema,

  // Drawer config
  DrawerRowConfigSchema,
  DrawerBoxMaterialsSchema,
  DrawerConfigSchema,

  // Door config
  DoorPanelConfigSchema,
  DoorConfigSchema,

  // Cabinet structure
  CabinetDimensionsSchema,
  CornerAnglesSchema,
  CabinetStructureSchema,
  CabinetManufacturingSchema,
  CabinetMaterialsSchema,
  CabinetComputedSchema,

  // Hardware (legacy)
  MinifixConfigSchema,
  HingeConfigSchema,
  ShelfPinConfigSchema,
  CabinetHardwareSchema,
  HardwareRotationOverrideSchema,
  HardwarePositionOverrideSchema,
  HardwarePointOverrideSchema,
  HardwarePointOverridesSchema,

  // Main cabinet
  CabinetSchema,

  // Types
  type CabinetSchemaType,
  type CabinetPanelSchemaType,
  type CabinetDimensionsSchemaType,
  type CabinetStructureSchemaType,
} from './cabinet.schema';

// ============================================
// PROJECT
// ============================================

export {
  // Versioning
  ProjectVersionSchema,
  SchemaVersionSchema,

  // Metadata
  ProjectMetadataSchema,

  // Scene layout
  ScenePositionSchema,
  SceneRotationSchema,
  CabinetSceneConfigSchema,

  // Project data
  ProjectDataSchema,

  // Saved projects
  SavedProjectSchema,
  SavedProjectsListSchema,

  // Import/Export
  ImportedProjectSchema,
  ExportProjectSchema,

  // Types
  type ProjectMetadataSchemaType,
  type ProjectDataSchemaType,
  type SavedProjectSchemaType,
  type ImportedProjectSchemaType,
  type ExportProjectSchemaType,
} from './project.schema';

// ============================================
// RE-EXPORT ZOD
// ============================================

export { z } from 'zod';
export type { ZodSchema, ZodError, ZodIssue } from 'zod';
