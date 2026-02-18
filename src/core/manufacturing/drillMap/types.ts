/**
 * DrillMap Types - v2.0 (Clean Rebuild)
 *
 * Minimal types for Minifix S200 drill map system.
 * Based on Häfele specifications.
 */

// ============================================
// BASIC TYPES
// ============================================

export type Vec3Tuple = [number, number, number];

export type DrillPurpose =
  | 'CAM_LOCK'      // Cam housing (Ø15, depth varies by wood thickness)
  | 'BOLT'          // Connecting bolt hole (Ø10, depth 17.5mm)
  | 'DOWEL'         // Wooden dowel (Ø8, depth varies)
  | 'SHELF_PIN'     // Shelf pin hole (Ø5)
  | 'HINGE'         // Hinge cup (Ø35)
  | 'MINIFIX'       // Minifix connector (alias for CAM_LOCK in some contexts)
  | 'DRAWER_SLIDE'  // Drawer slide mounting hole (Ø5, undermount or side-mount)
  | 'OTHER';

export type ComponentType =
  | 'HOUSING'       // Cam housing
  | 'BOLT'          // Bolt/sleeve
  | 'DOWEL'         // Wooden dowel
  | 'PIN'           // Shelf pin
  | 'HINGE'         // Hinge cup
  | 'SLIDE_HOLE'    // Drawer slide mounting hole
  | 'OTHER';

export type DrillStatus = 'VALID' | 'WARNING' | 'ERROR';

// ============================================
// HARDWARE TRANSFORM OVERRIDES (User-adjustable)
// ============================================

export type CornerType = 'TOP_LEFT' | 'TOP_RIGHT' | 'BOTTOM_LEFT' | 'BOTTOM_RIGHT';

/** User-specified rotation override for 3D hardware visualization */
export interface RotationOverride {
  rotX: number;  // radians
  rotY: number;  // radians
  rotZ: number;  // radians
}

/** User-specified position offset for hardware placement (mm) */
export interface PositionOverride {
  dx: number;  // mm - Left/Right offset
  dy: number;  // mm - Up/Down offset
  dz: number;  // mm - Forward/Back offset
}

/** Combined transform override (rotation + position) */
export interface HardwareTransformOverride {
  rotation?: RotationOverride;
  position?: PositionOverride;
}

/**
 * Position override limits are now DYNAMIC based on Cabinet AABB.
 * See cabinetBounds.ts for clampOverrideToCabinetBounds().
 *
 * Legacy fallback limits (used only when cabinet bounds unavailable):
 */
export const POSITION_OVERRIDE_FALLBACK_LIMITS = {
  min: -500,
  max: 500,
} as const;

/**
 * Minifix physical angle limits for angled cabinet corners.
 * Based on hardware constraints and panel interference.
 */
export const MINIFIX_ANGLE_LIMITS = {
  MIN_ANGLE: 30,      // Minimum angle (panels nearly parallel below this)
  MAX_ANGLE: 150,     // Maximum angle (panels nearly parallel above this)
  WARNING_MIN: 45,    // Below this may need longer bolts
  WARNING_MAX: 135,   // Above this may need longer bolts
} as const;

// ============================================
// DRILL POINT
// ============================================

export interface DrillMapPoint {
  id: string;
  panelId: string;

  // Position & Direction
  position: Vec3Tuple;      // World position [x, y, z]
  normal: Vec3Tuple;        // Drill direction (into material)

  // Drill specs
  diameter: number;         // mm
  depth: number;            // mm

  // Classification
  purpose: DrillPurpose;
  componentType: ComponentType;

  // Status
  status: DrillStatus;
  statusMessage?: string;
  issues?: string[];        // Validation issues or warnings for this point

  // Metadata
  pairId?: string;          // Links CAM to its BOLT
  edgeDistance?: number;    // Distance from panel edge (A dimension)
  depthPosition?: number;   // Position along panel depth (Z dimension)

  // Hardware visualization (optional)
  rotationOverride?: RotationOverride;  // User-specified rotation for 3D view
  positionOverride?: PositionOverride;  // User-specified position offset for 3D view + export
  cornerType?: CornerType;              // Detected corner position

  // Base position (before override) - for "Reset to Calculated"
  positionBase?: Vec3Tuple;

  // Extended drilling properties
  boltDirection?: Vec3Tuple;            // Direction vector of bolt [x, y, z]
  targetPocketCenter?: Vec3Tuple;       // Cam pocket center in world coords for this bolt (B=C truth)
  axialOffsetMm?: number;              // Distance from surface entry to ball center, ALONG drill normal only
  boltTwistDeg?: number;                // Bolt twist angle in degrees (for fin orientation)
  drillingDistanceB?: number;           // Secondary drilling distance
  jointStyle?: string;                  // Joint style identifier
  panelThickness?: number;              // Thickness of the panel in mm
  face?: 'A' | 'B' | 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';  // Which face of the panel
  pairedHoleId?: string;                // ID of paired hole for connectors
  connectedPanelRole?: string;          // Role of connected panel
  operationId?: string;                 // Operation identifier
  throughHole?: boolean;                // Whether it's a through hole
  cornerAngleDeg?: number;              // Corner angle for angled joints (30-150°)
}

// ============================================
// DISCRIMINATED UNION VARIANTS (Type-safe narrowing)
// ============================================

/**
 * Cam Lock drill point - housing for minifix cam (Ø15)
 * Discriminator: purpose === 'CAM_LOCK' || purpose === 'MINIFIX'
 */
export interface CamDrillPoint extends DrillMapPoint {
  purpose: 'CAM_LOCK' | 'MINIFIX';
  componentType: 'HOUSING';
  pairedHoleId: string;           // Required: links to bolt
  drillingDistanceB: number;      // Required: Häfele Distance B
}

/**
 * Bolt drill point - connecting bolt hole (Ø10)
 * Discriminator: purpose === 'BOLT'
 */
export interface BoltDrillPoint extends DrillMapPoint {
  purpose: 'BOLT';
  componentType: 'BOLT';
  pairId: string;                 // Required: links to cam
  boltDirection: Vec3Tuple;       // Required: direction vector
  targetPocketCenter: Vec3Tuple;  // Required: cam pocket center
}

/**
 * Dowel drill point (Ø8)
 * Discriminator: purpose === 'DOWEL'
 */
export interface DowelDrillPoint extends DrillMapPoint {
  purpose: 'DOWEL';
  componentType: 'DOWEL';
}

/**
 * Shelf pin drill point (Ø5)
 * Discriminator: purpose === 'SHELF_PIN'
 */
export interface ShelfPinDrillPoint extends DrillMapPoint {
  purpose: 'SHELF_PIN';
  componentType: 'PIN';
}

/**
 * Hinge cup drill point (Ø35)
 * Discriminator: purpose === 'HINGE'
 */
export interface HingeDrillPoint extends DrillMapPoint {
  purpose: 'HINGE';
  componentType: 'HINGE';
}

/**
 * Drawer slide mounting hole (Ø5)
 * Discriminator: purpose === 'DRAWER_SLIDE'
 */
export interface DrawerSlideDrillPoint extends DrillMapPoint {
  purpose: 'DRAWER_SLIDE';
  componentType: 'SLIDE_HOLE';
  rowIndex?: number;    // Drawer row index (0 = bottom)
  slideType?: 'undermount' | 'side_mount';
}

/**
 * Union type for type-safe handling of specific drill point types
 */
export type TypedDrillPoint =
  | CamDrillPoint
  | BoltDrillPoint
  | DowelDrillPoint
  | ShelfPinDrillPoint
  | HingeDrillPoint
  | DrawerSlideDrillPoint
  | DrillMapPoint;  // Fallback for 'OTHER'

// ============================================
// TYPE GUARDS (Runtime type narrowing)
// ============================================

/**
 * Check if a drill point is a Cam/Minifix housing
 */
export function isCamDrillPoint(point: DrillMapPoint): point is CamDrillPoint {
  return (point.purpose === 'CAM_LOCK' || point.purpose === 'MINIFIX') &&
    point.componentType === 'HOUSING' &&
    typeof point.pairedHoleId === 'string';
}

/**
 * Check if a drill point is a Bolt hole
 */
export function isBoltDrillPoint(point: DrillMapPoint): point is BoltDrillPoint {
  return point.purpose === 'BOLT' &&
    point.componentType === 'BOLT' &&
    typeof point.pairId === 'string' &&
    Array.isArray(point.boltDirection);
}

/**
 * Check if a drill point is a Dowel hole
 */
export function isDowelDrillPoint(point: DrillMapPoint): point is DowelDrillPoint {
  return point.purpose === 'DOWEL' && point.componentType === 'DOWEL';
}

/**
 * Check if a drill point is a Shelf Pin hole
 */
export function isShelfPinDrillPoint(point: DrillMapPoint): point is ShelfPinDrillPoint {
  return point.purpose === 'SHELF_PIN' && point.componentType === 'PIN';
}

/**
 * Check if a drill point is a Hinge cup
 */
export function isHingeDrillPoint(point: DrillMapPoint): point is HingeDrillPoint {
  return point.purpose === 'HINGE' && point.componentType === 'HINGE';
}

/**
 * Check if a drill point is a Drawer Slide mounting hole
 */
export function isDrawerSlideDrillPoint(point: DrillMapPoint): point is DrawerSlideDrillPoint {
  return point.purpose === 'DRAWER_SLIDE' && point.componentType === 'SLIDE_HOLE';
}

/**
 * Check if a drill point is part of a Minifix pair (Cam or Bolt)
 */
export function isMinifixPairPoint(point: DrillMapPoint): point is CamDrillPoint | BoltDrillPoint {
  return isCamDrillPoint(point) || isBoltDrillPoint(point);
}

// ============================================
// DRILL MAP PANEL
// ============================================

export interface DrillMapPanel {
  panelId: string;
  role: string;             // LEFT_SIDE, RIGHT_SIDE, TOP, BOTTOM, etc.
  cabinetId?: string;       // ID of the cabinet this panel belongs to

  // Panel geometry
  dimensions: {
    width: number;
    height: number;
    thickness: number;
  };

  // World transform
  worldPosition: Vec3Tuple;
  worldRotation: Vec3Tuple;

  // Drill points on this panel
  points: DrillMapPoint[];

  // Optional groove operations (for CNC routing)
  grooves?: unknown[];
}

// ============================================
// DRILL MAP (ROOT)
// ============================================

export interface DrillMapSummary {
  totalPanels?: number;
  totalPoints?: number;
  totalDrills?: number;
  totalBores?: number;
  totalGrooves?: number;
  toolChanges?: number;
  estimatedTime?: number;
  byPurpose?: Partial<Record<DrillPurpose, number>> | Record<string, number>;
  byStatus?: Partial<Record<DrillStatus, number>>;
  byDiameter?: Record<string, number>;
}

/**
 * Statistics about the drill map operations
 */
export interface DrillMapStats {
  totalPoints?: number;
  totalDrills?: number;
  totalBores?: number;      // Large holes (diameter > 10mm)
  byPurpose: Partial<Record<DrillPurpose, number>> | Record<string, number>;
  byFace?: Record<string, number>;
}

export interface DrillMap {
  // Identity (at least one must be provided)
  cabinetId?: string;        // ID of the cabinet this drill map belongs to
  version: string;

  // Timestamps (supports both number and ISO string formats)
  generatedAt?: number | string;  // ISO timestamp or epoch when the map was generated
  createdAt?: string;             // Alternative ISO timestamp (for test compatibility)

  jobId?: string;            // Job identifier for batch processing
  summary?: DrillMapSummary; // Summary statistics (alternative to stats)

  // All panels with drill points
  panels: DrillMapPanel[];

  // Statistics (optional for backward compatibility)
  stats?: DrillMapStats;

  // Additional metadata (used by test fixtures and validation)
  tools?: unknown[];         // Tool list for the drill map
  warnings?: string[];       // Validation warnings

  // Traceability: deterministic hashes of inputs for audit/debug
  meta?: DrillMapMeta;
}

/**
 * Traceability metadata attached to each generated DrillMap.
 * Hashes reflect merged (fullConfig + fullParams) inputs — NOT timestamps.
 * Use to answer: "which config produced this drill map?"
 */
export interface DrillMapMeta {
  generator: {
    name: string;             // e.g. 'generateMinifixDrillMap', 'generateDowelDrillMap'
    version: string;
    env?: 'dev' | 'prod';
  };
  inputs: {
    connectorCount?: number;
    presetId?: string;
    /** SHA-256 hex of stableStringify(fullConfig) — 64 chars */
    configHash: string;
    /** SHA-256 hex of stableStringify(fullParams) — 64 chars */
    paramsHash: string;
  };
  timestamps?: {
    /** ISO string — for audit/debug only, NOT included in hashes */
    generatedAtIso: string;
  };
}

// ============================================
// MINIFIX CONFIG (from HardwareLibrary)
// ============================================

export interface MinifixConfig {
  minifixType: '15' | '12';
  drillingDistanceB: number;  // 24mm per CAD spec (Häfele Distance B)
  woodThickness: number;

  // Ball Head
  ballHeadDia: number;
  ballHeadOffset: number;

  // Neck Shaft
  neckShaftDia: number;
  neckShaftLength: number;
  neckShaftOffset: number;

  // Sleeve (Bolt hole)
  sleeveDia: number;          // 10mm
  sleeveLength: number;       // 17.5mm
  sleeveOffset: number;

  // Shaft (Threaded)
  shaftDia: number;           // 5mm
  shaftLength: number;        // 11mm (L dimension)
  shaftOffset: number;

  // Cam
  camDia: number;             // 15mm
  camDepth: number;           // varies by wood thickness
  camHeight: number;          // dimA
  camRimDia: number;
  camRimHeight: number;
  camOffset: number;

  // Dowel
  includeDowel: boolean;
  dowelDia: number;           // 8mm
  dowelLength: number;        // 30mm (total: 12 + 18)
  dowelOffset: number;        // 32mm (System 32)

  // v4.0 Side-covers-Top construction:
  // - SIDE panel: FACE bore (shallow, into inner face)
  // - HORIZ panel: EDGE bore (deeper, into end grain)
  dowelDepthSideFace?: number;   // 12mm - depth into SIDE panel face (FACE_BORE)
  dowelDepthHorizEdge?: number;  // 18mm - depth into TOP/BOTTOM panel edge (EDGE_BORE)

  // Legacy v3.x fields (for backward compatibility):
  // - dowelDepthEdge was for SIDE panel edge bore (Top-on-Side construction)
  // - dowelDepthFace was for HORIZ panel face bore (Top-on-Side construction)
  dowelDepthEdge: number;     // @deprecated - use dowelDepthSideFace + dowelDepthHorizEdge
  dowelDepthFace: number;     // @deprecated - use dowelDepthSideFace + dowelDepthHorizEdge
}

// ============================================
// DRILLING PARAMS (User-adjustable)
// ============================================

export interface DrillingParams {
  firstHoleZ: number;         // System 32 first hole (default: 37mm)
  drillingDistanceB: number;  // Häfele B (default: 24mm per CAD spec)
}

export const DEFAULT_DRILLING_PARAMS: DrillingParams = {
  firstHoleZ: 37,
  drillingDistanceB: 24,  // 24mm per CAD reference (Minifix 12 / Indetails standard)
};

// ============================================
// CONNECTOR PLATE CONFIG
// ============================================

export interface ConnectorPlateConfig {
  length: number;           // Plate length in mm
  width: number;            // Plate width in mm
  thickness: number;        // Plate thickness in mm
  holeCount: number;        // Number of connector holes
  holeSpacing: number;      // Spacing between holes in mm
  holeDiameter: number;     // Diameter of connector holes in mm
  edgeDistance: number;     // Distance from edge to first hole in mm
}

export const DEFAULT_CONNECTOR_PLATE_CONFIG: ConnectorPlateConfig = {
  length: 100,
  width: 30,
  thickness: 3,
  holeCount: 2,
  holeSpacing: 32,
  holeDiameter: 8,
  edgeDistance: 34,
};

export interface ConnectorPlateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates a connector plate configuration.
 * @param config - The connector plate configuration to validate
 * @returns Validation result with errors and warnings
 */
export function validateConnectorPlateConfig(
  config: ConnectorPlateConfig
): ConnectorPlateValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic dimension validation
  if (config.length <= 0) {
    errors.push('Plate length must be greater than 0');
  }
  if (config.width <= 0) {
    errors.push('Plate width must be greater than 0');
  }
  if (config.thickness <= 0) {
    errors.push('Plate thickness must be greater than 0');
  }
  if (config.holeCount < 1) {
    errors.push('Hole count must be at least 1');
  }
  if (config.holeDiameter <= 0) {
    errors.push('Hole diameter must be greater than 0');
  }
  if (config.edgeDistance < 0) {
    errors.push('Edge distance cannot be negative');
  }

  // Geometry validation
  const requiredLength = config.edgeDistance * 2 + (config.holeCount - 1) * config.holeSpacing;
  if (requiredLength > config.length) {
    errors.push(`Plate length (${config.length}mm) is too short for ${config.holeCount} holes with ${config.holeSpacing}mm spacing`);
  }

  // Warnings
  if (config.thickness < 2) {
    warnings.push('Plate thickness less than 2mm may affect structural integrity');
  }
  if (config.holeDiameter > config.width * 0.8) {
    warnings.push('Hole diameter is large relative to plate width');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export interface ConnectorPlateDrillMapOptions {
  plateConfig: ConnectorPlateConfig;
  panelId?: string;
  panelThickness?: number;
  position?: Vec3Tuple;
  rotation?: Vec3Tuple;
}

/**
 * Generates a drill map for a connector plate.
 * @param options - Options for generating the drill map
 * @returns DrillMap for the connector plate
 */
export function generateConnectorPlateDrillMap(
  options: ConnectorPlateDrillMapOptions
): DrillMap {
  const {
    plateConfig,
    panelId = 'connector-plate',
    panelThickness = plateConfig.thickness,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
  } = options;

  const points: DrillMapPoint[] = [];
  const startX = plateConfig.edgeDistance;

  for (let i = 0; i < plateConfig.holeCount; i++) {
    const x = startX + i * plateConfig.holeSpacing;
    const y = plateConfig.width / 2;

    points.push({
      id: `plate-hole-${i}`,
      panelId,
      position: [position[0] + x, position[1] + y, position[2]],
      normal: [0, 0, -1],
      diameter: plateConfig.holeDiameter,
      depth: panelThickness,
      purpose: 'BOLT',
      componentType: 'BOLT',
      status: 'VALID',
      throughHole: true,
    });
  }

  return {
    cabinetId: 'connector-plate-assembly',
    version: '2.0',
    generatedAt: Date.now(),
    panels: [
      {
        panelId,
        role: 'CONNECTOR_PLATE',
        dimensions: {
          width: plateConfig.length,
          height: plateConfig.width,
          thickness: plateConfig.thickness,
        },
        worldPosition: position,
        worldRotation: rotation,
        points,
      },
    ],
    stats: {
      totalDrills: points.length,
      totalBores: 0,
      byPurpose: {
        CAM_LOCK: 0,
        BOLT: points.length,
        DOWEL: 0,
        SHELF_PIN: 0,
        HINGE: 0,
        MINIFIX: 0,
        DRAWER_SLIDE: 0,
        OTHER: 0,
      },
    },
  };
}
