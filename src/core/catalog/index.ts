/**
 * MONOLITH Catalog System - Central Export
 *
 * ARCHITECTURE (North Star v4.0):
 * - Cabinet Taxonomy: Standard cabinet types and configurations
 * - Wall Decoration: Wainscoting, slat, and hidden door algorithms
 * - Kerf Bending: Curved panel manufacturing formulas
 * - Manufacturing: Material and process constraints
 *
 * USAGE:
 * import { CABINET_TYPES, calculateWainscoting, calculateKerfBending } from '@/core/catalog';
 */

// ============================================
// CABINET TAXONOMY
// ============================================

export {
  // Types
  type CabinetCategory,
  type CornerType,
  type ApplianceType,
  type DimensionalStandard,
  type CabinetStandards,
  type CabinetTypeDefinition,
  type ErgonomicGuidelines,
  type VentilationRequirement,
  type CornerCabinetParams,
  type ConstructionType,
  type ConstructionTypeSpec,
  type OmniClassCode,
  type UniclassCode,
  type CounterHeightMarket,
  type HeightStack,
  type HeightStackInput,
  type HeightStackWarning,
  type HeightStackWarningCode,
  type HeightStackError,
  type HeightStackErrorCode,
  type MarketHeightProfile,
  type WorktopThicknessGap,
  type WallCabinetPlacement,
  type WallCabinetPlacementInput,
  type WallPlacementError,
  type WallPlacementErrorCode,
  type WallPlacementWarning,
  type WallPlacementWarningCode,

  // Constants
  BASE_CABINET_STANDARDS,
  WALL_CABINET_STANDARDS,
  TALL_CABINET_STANDARDS,
  CORNER_CABINET_STANDARDS,
  CABINET_TYPES,
  ERGONOMIC_STANDARDS,
  VENTILATION_REQUIREMENTS,
  CONSTRUCTION_TYPES,
  OMNICLASS_CODES,
  UNICLASS_CODES,

  // Height stack (counter height in, plinth out)
  JIS_A0017_2018,
  NEXT125_PLINTH_RUNGS_MM,
  PUBLISHED_PLINTH_RUNGS_MM,
  COUNTER_HEIGHT_TARGETS_MM,
  DEFAULT_COUNTER_HEIGHT_MM,
  DEFAULT_CARCASS_HEIGHT_MM,
  DEFAULT_WORKTOP_THICKNESS_MM,
  DEFAULT_WORKTOP_BUILT_THICKNESS_MM,
  DEFAULT_WORKTOP_THICKNESS_GAP,
  DEFAULT_HEIGHT_STACK,
  DEFAULT_TOE_KICK_HEIGHT_MM,
  MARKET_HEIGHT_PROFILES,

  // Wall cabinet placement (counter height in, mounting height out)
  DEFAULT_WALL_CABINET_GAP_MM,
  WALL_CABINET_UNDERSIDE_SNAP_MM,
  ERGONOMIC_REACH_MAX_MM,
  DEFAULT_WALL_CABINET_PLACEMENT,

  // Discrete dimensional sets
  CABINET_WIDTH_SET_MM,
  BASE_DEPTH_SET_MM,
  WALL_DEPTH_SET_MM,
  WALL_DEPTHS_EXCEEDING_JIS_CEILING_MM,
  OVEN_HOUSING_MIN_DEPTH_MM,

  // Functions
  deriveHeightStack,
  deriveMarketHeightStack,
  assertBuildableHeightStack,
  findClosestBuildableWorktop,
  deriveWallCabinetPlacement,
  validateWallCabinetUnderside,
  assertPlaceableWallCabinet,
  resolveWorktopThickness,
  reportHeightStackWarnings,
  getCabinetType,
  getCabinetsByCategory,
  validateDimensions,
  getVentilationRequirements,
  calculateApplianceOpening,
  calculateBlindCorner,
  calculateDiagonalCorner,
  calculateLazySusanSpace,
  getBIMCodes,
  calculateInteriorWidth,
  get32mmHolePositions,
} from './CabinetTaxonomy';

// ============================================
// SYSTEM 32 — SINGLE SOURCE OF TRUTH
// ============================================

export {
  type System32Grid,
  type System32Provenance,
  SYSTEM_32_GRID,
  nearestSystem32Position,
  isOnSystem32Grid,
} from './System32';

// ============================================
// PLINTH LEG HARDWARE
// ============================================

export {
  // Types
  type PlinthLeg,
  type LegProvenance,
  type LegReachability,
  type LegReachabilityCode,
  type LevellingTolerance,

  // Constants
  THAI_ADJUSTABLE_LEG_70,
  THAI_LEG_100_RETIRED,
  PLINTH_LEG_CATALOG,
  DEFAULT_PLINTH_LEG,

  // Functions
  resolvePlinthLeg,
  assessLegReachability,
  computeLevellingTolerance,
} from './PlinthLegCatalog';

// ============================================
// WALL DECORATION
// ============================================

export {
  // Types
  type WainscotingStyle,
  type WainscotingParams,
  type WainscotingResult,
  type WainscotingCutItem,
  type SlatParams,
  type SlatResult,
  type HiddenDoorParams,
  type HiddenDoorResult,
  type AttractorPoint,
  type TriplanarWeights,

  // Functions
  calculateWainscoting,
  calculateSlatSpacing,
  calculateHiddenDoorCladding,
  calculateAttractorDeformation,
  calculateTriplanarWeights,
  sharpenTriplanarWeights,
  calculateGoldenRatioDimensions,
  isGoldenRatio,

  // Constants
  PHI,
} from './WallDecoration';

// ============================================
// KERF BENDING
// ============================================

export {
  // Types
  type KerfMaterial,
  type KerfProfile,
  type KerfBendingParams,
  type KerfBendingResult,
  type KerfCNCParams,
  type KerfLine,

  // Constants
  WEB_THICKNESS_LIMITS,

  // Functions
  calculateArcLength,
  calculateArcLengthDelta,
  calculateKerfCount,
  calculateKerfSpacing,
  calculateKerfDepth,
  calculateKerfBending,
  getMinimumBendRadius,
  generateStraightKerfPattern,
  generateLivingHingePattern,
  calculateRequiredKerfParams,
  generateKerfBendingSummary,
} from './KerfBending';

// ============================================
// HÄFELE MINIFIX HARDWARE
// ============================================

export {
  // Types
  type MinifixHousingType,
  type MinifixHousingSpec,
  type ConnectingBoltType,
  type ConnectingBoltSpec,
  type DowelType,
  type WoodDowelSpec,
  type DrillHole,
  type DrillingPattern,

  // Constants
  MINIFIX_HOUSINGS,
  CONNECTING_BOLTS,
  WOOD_DOWELS,

  // Functions
  generateMinifixDrillingPattern,
  generateMinifixArrayPattern,
  getRecommendedMinifixConfig,
  validateMinifixLoad,
  getCompatibleHardware,
  patternToDxfCoordinates,
  generateDrillingSummary,
} from './MinifixHardware';

// ============================================
// MANUFACTURING CONSTRAINTS
// ============================================

export {
  // Types
  type BoardMaterial,
  type SurfaceMaterialType,
  type EdgeMaterialType,
  type BoardMaterialSpec,
  type SurfaceMaterialSpec,
  type EdgeMaterialSpec,
  type CNCMachineConstraints,
  type EdgeBanderConstraints,
  type PanelDimensionConstraints,

  // Constants
  BOARD_MATERIALS,
  SURFACE_MATERIALS,
  EDGE_MATERIALS,
  DEFAULT_CNC_CONSTRAINTS,
  DEFAULT_EDGEBANDER_CONSTRAINTS,
  PANEL_DIMENSION_CONSTRAINTS,

  // Functions
  validatePanelDimensions,
  validateRoutingDepth,
  calculateSheetUtilization,
  getRecommendedEdge,
} from './ManufacturingConstraints';

// ============================================
// CONVENIENCE RE-EXPORTS
// ============================================

/**
 * Quick access to common cabinet types
 */
export const CabinetPresets = {
  baseStandard: 'BASE_STANDARD',
  baseDrawer: 'BASE_DRAWER',
  baseSink: 'BASE_SINK',
  wallStandard: 'WALL_STANDARD',
  wallHood: 'WALL_HOOD',
  tallPantry: 'TALL_PANTRY',
  cornerBlind: 'CORNER_BLIND',
  cornerDiagonal: 'CORNER_DIAGONAL',
  applianceOven: 'APPLIANCE_OVEN',
  applianceMicrowave: 'APPLIANCE_MICROWAVE',
} as const;

/**
 * Material compatibility matrix
 *
 * Usage: MATERIAL_COMPATIBILITY[boardType][surfaceType] = true/false
 */
export const MATERIAL_COMPATIBILITY: Record<string, Record<string, boolean>> = {
  MDF: {
    HPL: true,
    MELAMINE: true,
    VENEER: true,
    PVC_FILM: true,
    ACRYLIC: true,
    PAINT: true,
  },
  HMR: {
    HPL: true,
    MELAMINE: true,
    VENEER: false,  // Veneer doesn't adhere well to HMR
    PVC_FILM: true,
    ACRYLIC: true,
    PAINT: true,
  },
  PARTICLE_BOARD: {
    HPL: true,
    MELAMINE: true,
    VENEER: false,
    PVC_FILM: true,
    ACRYLIC: false,
    PAINT: false,  // Particle board needs sealing first
  },
  PLYWOOD_BB: {
    HPL: true,
    MELAMINE: false,
    VENEER: true,
    PVC_FILM: true,
    ACRYLIC: true,
    PAINT: true,
  },
};
