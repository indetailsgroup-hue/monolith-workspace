/**
 * Cabinet Taxonomy - Built-in Cabinet Catalog System
 *
 * ARCHITECTURE (North Star v4.0):
 * - Standard cabinet types with ergonomic dimensions
 * - Ventilation requirements for appliance units
 * - Corner cabinet algorithms
 * - BIM classification codes (OmniClass/Uniclass)
 * - Face Frame vs Frameless construction types
 *
 * REFERENCE: Kitchen Industry Standards (NKBA/KCMA)
 */

// ============================================
// BIM CLASSIFICATION CODES
// ============================================

/**
 * OmniClass Classification (North America)
 * Table 23: Products - Used for BIM object classification
 *
 * Reference: https://www.omniclass.org/
 */
export interface OmniClassCode {
  table: string;      // Table number (e.g., "23")
  number: string;     // Full classification number
  title: string;      // Official title
}

export const OMNICLASS_CODES: Record<string, OmniClassCode> = {
  // Casework (General)
  CASEWORK: {
    table: '23',
    number: '23-21 23 00',
    title: 'Casework',
  },
  // Base Cabinets
  BASE_CABINET: {
    table: '23',
    number: '23-21 23 13',
    title: 'Base Cabinets',
  },
  // Wall Cabinets
  WALL_CABINET: {
    table: '23',
    number: '23-21 23 16',
    title: 'Wall Cabinets',
  },
  // Tall Cabinets
  TALL_CABINET: {
    table: '23',
    number: '23-21 23 19',
    title: 'Tall Cabinets',
  },
  // Kitchen Casework
  KITCHEN_CASEWORK: {
    table: '23',
    number: '23-21 23 13 11',
    title: 'Residential Kitchen Casework',
  },
  // Laboratory Casework
  LAB_CASEWORK: {
    table: '23',
    number: '23-21 23 13 14',
    title: 'Laboratory Casework',
  },
};

/**
 * Uniclass 2015 Classification (UK/International)
 * Systems (Ss) and Products (Pr) tables
 *
 * Reference: https://www.thenbs.com/our-tools/uniclass-2015
 */
export interface UniclassCode {
  table: 'Ss' | 'Pr' | 'EF';  // Systems, Products, or Elements/Functions
  number: string;              // Classification number
  title: string;               // Official title
}

export const UNICLASS_CODES: Record<string, UniclassCode> = {
  // Systems - Fitted furniture
  FITTED_FURNITURE_SYSTEM: {
    table: 'Ss',
    number: 'Ss_45_40',
    title: 'Fitted furniture systems',
  },
  // Systems - Kitchen
  KITCHEN_SYSTEM: {
    table: 'Ss',
    number: 'Ss_45_40_42',
    title: 'Kitchen unit systems',
  },
  // Products - Base units
  BASE_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_07',
    title: 'Base units',
  },
  // Products - Wall units
  WALL_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_95',
    title: 'Wall units',
  },
  // Products - Tall units
  TALL_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_88',
    title: 'Tall units',
  },
  // Products - Corner units
  CORNER_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_19',
    title: 'Corner units',
  },
  // Elements - FF Fittings, furnishings and equipment
  FITTINGS_ELEMENT: {
    table: 'EF',
    number: 'EF_45',
    title: 'Fittings, furnishings and equipment',
  },
};

/**
 * Get BIM classification codes for a cabinet category
 */
export function getBIMCodes(category: CabinetCategory): {
  omniclass: OmniClassCode;
  uniclass: UniclassCode;
} {
  const mapping: Record<CabinetCategory, { omni: string; uni: string }> = {
    BASE: { omni: 'BASE_CABINET', uni: 'BASE_UNIT' },
    WALL: { omni: 'WALL_CABINET', uni: 'WALL_UNIT' },
    TALL: { omni: 'TALL_CABINET', uni: 'TALL_UNIT' },
    CORNER: { omni: 'BASE_CABINET', uni: 'CORNER_UNIT' },
    APPLIANCE: { omni: 'KITCHEN_CASEWORK', uni: 'KITCHEN_SYSTEM' },
  };

  const codes = mapping[category];
  return {
    omniclass: OMNICLASS_CODES[codes.omni],
    uniclass: UNICLASS_CODES[codes.uni],
  };
}

// ============================================
// CONSTRUCTION TYPE (Face Frame vs Frameless)
// ============================================

/**
 * Cabinet Construction Type
 *
 * FACE_FRAME (American Traditional):
 * - Solid wood frame attached to front of cabinet box
 * - Doors/drawers attach to frame
 * - More structural rigidity
 * - Slightly reduced interior space due to frame
 * - Overlay: Full, Half, or Inset
 *
 * FRAMELESS (European/32mm System):
 * - No front frame, doors attach directly to sides
 * - Full access to interior space
 * - Based on 32mm hole pattern for hardware
 * - Cleaner, modern appearance
 * - Requires thicker side panels (typically 18mm+)
 */
export type ConstructionType = 'FACE_FRAME' | 'FRAMELESS';

export interface ConstructionTypeSpec {
  type: ConstructionType;
  name: string;
  nameTH: string;
  description: string;

  // Structural requirements
  minSidePanelThickness: number;   // mm
  requiresFrontFrame: boolean;
  holePatternSpacing?: number;     // mm (32mm for frameless)

  // Door mounting
  hingeType: 'frame-mount' | 'side-mount';
  typicalOverlay: 'full' | 'half' | 'inset';

  // Space efficiency
  interiorWidthReduction: number;  // mm lost to frame (per side)
}

export const CONSTRUCTION_TYPES: Record<ConstructionType, ConstructionTypeSpec> = {
  FACE_FRAME: {
    type: 'FACE_FRAME',
    name: 'Face Frame (American)',
    nameTH: 'แบบมีกรอบหน้า (อเมริกัน)',
    description: 'Traditional construction with solid wood frame on cabinet front',
    minSidePanelThickness: 12,
    requiresFrontFrame: true,
    hingeType: 'frame-mount',
    typicalOverlay: 'half',
    interiorWidthReduction: 38,  // ~1.5" frame stile per side
  },
  FRAMELESS: {
    type: 'FRAMELESS',
    name: 'Frameless (European 32mm)',
    nameTH: 'แบบไร้กรอบ (ยุโรป 32mm)',
    description: 'Modern construction with doors mounted directly to sides, 32mm system',
    minSidePanelThickness: 18,
    requiresFrontFrame: false,
    holePatternSpacing: 32,
    hingeType: 'side-mount',
    typicalOverlay: 'full',
    interiorWidthReduction: 0,
  },
};

/**
 * Calculate interior cabinet width based on construction type
 */
export function calculateInteriorWidth(
  exteriorWidth: number,
  panelThickness: number,
  constructionType: ConstructionType
): number {
  const spec = CONSTRUCTION_TYPES[constructionType];

  // Subtract panel thickness from both sides
  let interiorWidth = exteriorWidth - (panelThickness * 2);

  // Subtract frame if face frame construction
  if (spec.requiresFrontFrame) {
    interiorWidth -= spec.interiorWidthReduction;
  }

  return interiorWidth;
}

/**
 * Get 32mm system hole positions for frameless cabinets
 *
 * The 32mm system uses a standardized hole pattern:
 * - Holes spaced 32mm apart vertically
 * - First hole 37mm from top/bottom
 * - Holes 37mm from front edge
 * - Used for shelf pins, hinges, drawer slides
 */
export function get32mmHolePositions(
  panelHeight: number,
  startFromTop: number = 37,
  startFromBottom: number = 37
): number[] {
  const positions: number[] = [];
  const usableHeight = panelHeight - startFromTop - startFromBottom;
  const holeCount = Math.floor(usableHeight / 32) + 1;

  for (let i = 0; i < holeCount; i++) {
    positions.push(startFromTop + (i * 32));
  }

  return positions;
}

// ============================================
// CABINET CATEGORY DEFINITIONS
// ============================================

export type CabinetCategory =
  | 'BASE'        // Base cabinets (floor standing)
  | 'WALL'        // Wall cabinets (mounted)
  | 'TALL'        // Tall/Pantry cabinets
  | 'CORNER'      // Corner cabinets
  | 'APPLIANCE';  // Appliance housings

export type CornerType =
  | 'BLIND'       // Blind corner (one accessible side)
  | 'DIAGONAL'    // 45-degree corner
  | 'L_SHAPED'    // L-shaped lazy susan
  | 'MAGIC';      // Magic corner pull-out

export type ApplianceType =
  | 'OVEN'        // Built-in oven
  | 'MICROWAVE'   // Microwave housing
  | 'REFRIGERATOR'// Refrigerator surround
  | 'DISHWASHER'  // Dishwasher panel
  | 'WASHER'      // Washer housing
  | 'HOOD';       // Range hood housing

// ============================================
// DIMENSIONAL STANDARDS
// ============================================

export interface DimensionalStandard {
  min: number;
  max: number;
  default: number;
  step: number;    // Increment step (usually 50mm or 100mm)
}

export interface CabinetStandards {
  width: DimensionalStandard;
  height: DimensionalStandard;
  depth: DimensionalStandard;
}

/**
 * Base Cabinet Standards (ตู้ล่าง)
 *
 * Height: 720mm standard (counter height 900mm = 720 + 100 toe + 40 countertop + 40 clearance)
 * Depth: 560-600mm (24" standard)
 * Width: 300-1200mm in 50mm increments
 */
export const BASE_CABINET_STANDARDS: CabinetStandards = {
  width: { min: 300, max: 1200, default: 600, step: 50 },
  height: { min: 680, max: 900, default: 720, step: 20 },
  depth: { min: 500, max: 650, default: 560, step: 10 },
};

/**
 * Wall Cabinet Standards (ตู้ลอย)
 *
 * Height: 600-900mm (varies by style)
 * Depth: 300-400mm (12-16" to avoid head bumps)
 * Width: 300-1200mm in 50mm increments
 *
 * ERGONOMIC NOTES:
 * - Bottom of wall cabinet: 1350-1500mm from floor
 * - Gap between base and wall: 400-500mm (backsplash zone)
 */
export const WALL_CABINET_STANDARDS: CabinetStandards = {
  width: { min: 300, max: 1200, default: 600, step: 50 },
  height: { min: 300, max: 900, default: 720, step: 50 },
  depth: { min: 250, max: 400, default: 320, step: 10 },
};

/**
 * Tall Cabinet Standards (ตู้สูง/ตู้ Pantry)
 *
 * Height: 2000-2400mm (floor to ceiling)
 * Depth: Match base cabinets (560-600mm)
 * Width: 450-900mm
 */
export const TALL_CABINET_STANDARDS: CabinetStandards = {
  width: { min: 450, max: 900, default: 600, step: 50 },
  height: { min: 1800, max: 2400, default: 2200, step: 100 },
  depth: { min: 500, max: 650, default: 560, step: 10 },
};

/**
 * Corner Cabinet Standards (ตู้เข้ามุม)
 *
 * Width/Depth: Equal on both sides for true corner
 * Blind corner: 900mm face + 300-450mm blind
 */
export const CORNER_CABINET_STANDARDS: CabinetStandards = {
  width: { min: 800, max: 1200, default: 900, step: 50 },
  height: { min: 680, max: 900, default: 720, step: 20 },
  depth: { min: 800, max: 1200, default: 900, step: 50 },
};

// ============================================
// CABINET TYPE DEFINITIONS
// ============================================

export interface CabinetTypeDefinition {
  id: string;
  category: CabinetCategory;
  name: string;
  nameTH: string;
  description: string;
  standards: CabinetStandards;

  // Component configuration
  defaultShelfCount: number;
  hasToeKick: boolean;
  toeKickHeight?: number;
  hasBack: boolean;

  // Joint defaults
  defaultTopJoint: 'INSET' | 'OVERLAY';
  defaultBottomJoint: 'INSET' | 'OVERLAY';

  // Special features
  features?: string[];
}

/**
 * Complete Cabinet Type Catalog
 */
export const CABINET_TYPES: Record<string, CabinetTypeDefinition> = {

  // ============================================
  // BASE CABINETS (ตู้ล่าง)
  // ============================================

  BASE_STANDARD: {
    id: 'BASE_STANDARD',
    category: 'BASE',
    name: 'Standard Base Cabinet',
    nameTH: 'ตู้ล่างมาตรฐาน',
    description: 'Standard base cabinet with adjustable shelf',
    standards: BASE_CABINET_STANDARDS,
    defaultShelfCount: 1,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['adjustable-shelf', 'soft-close-door'],
  },

  BASE_DRAWER: {
    id: 'BASE_DRAWER',
    category: 'BASE',
    name: 'Drawer Base Cabinet',
    nameTH: 'ตู้ล่างลิ้นชัก',
    description: 'Base cabinet with drawers instead of doors',
    standards: BASE_CABINET_STANDARDS,
    defaultShelfCount: 0,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['drawer-system', 'soft-close-drawer'],
  },

  BASE_SINK: {
    id: 'BASE_SINK',
    category: 'BASE',
    name: 'Sink Base Cabinet',
    nameTH: 'ตู้ล่างอ่างล้าง',
    description: 'Base cabinet for sink installation (no shelf, false bottom)',
    standards: {
      ...BASE_CABINET_STANDARDS,
      width: { min: 600, max: 1200, default: 800, step: 50 },
    },
    defaultShelfCount: 0,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['sink-cutout', 'plumbing-access', 'false-bottom'],
  },

  // ============================================
  // WALL CABINETS (ตู้ลอย)
  // ============================================

  WALL_STANDARD: {
    id: 'WALL_STANDARD',
    category: 'WALL',
    name: 'Standard Wall Cabinet',
    nameTH: 'ตู้ลอยมาตรฐาน',
    description: 'Standard wall-mounted cabinet',
    standards: WALL_CABINET_STANDARDS,
    defaultShelfCount: 2,
    hasToeKick: false,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['adjustable-shelf', 'soft-close-door', 'wall-mount'],
  },

  WALL_HOOD: {
    id: 'WALL_HOOD',
    category: 'WALL',
    name: 'Hood Surround Cabinet',
    nameTH: 'ตู้คลุมเครื่องดูดควัน',
    description: 'Cabinet surrounding range hood',
    standards: {
      ...WALL_CABINET_STANDARDS,
      width: { min: 600, max: 900, default: 600, step: 50 },
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,  // Open back for hood vent
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['hood-opening', 'vent-access'],
  },

  WALL_OPEN: {
    id: 'WALL_OPEN',
    category: 'WALL',
    name: 'Open Shelf Cabinet',
    nameTH: 'ตู้ลอยเปิดโล่ง',
    description: 'Wall cabinet without doors (open shelving)',
    standards: WALL_CABINET_STANDARDS,
    defaultShelfCount: 2,
    hasToeKick: false,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['open-front', 'adjustable-shelf'],
  },

  // ============================================
  // TALL CABINETS (ตู้สูง)
  // ============================================

  TALL_PANTRY: {
    id: 'TALL_PANTRY',
    category: 'TALL',
    name: 'Pantry Cabinet',
    nameTH: 'ตู้ Pantry',
    description: 'Full-height storage cabinet with multiple shelves',
    standards: TALL_CABINET_STANDARDS,
    defaultShelfCount: 5,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['adjustable-shelf', 'pull-out-tray'],
  },

  TALL_BROOM: {
    id: 'TALL_BROOM',
    category: 'TALL',
    name: 'Broom Cabinet',
    nameTH: 'ตู้เก็บไม้กวาด',
    description: 'Tall narrow cabinet for cleaning supplies',
    standards: {
      ...TALL_CABINET_STANDARDS,
      width: { min: 300, max: 600, default: 450, step: 50 },
    },
    defaultShelfCount: 2,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['broom-hooks', 'adjustable-shelf'],
  },

  // ============================================
  // CORNER CABINETS (ตู้เข้ามุม)
  // ============================================

  CORNER_BLIND: {
    id: 'CORNER_BLIND',
    category: 'CORNER',
    name: 'Blind Corner Cabinet',
    nameTH: 'ตู้มุมตาบอด',
    description: 'Corner cabinet with blind side (accessible from one direction)',
    standards: CORNER_CABINET_STANDARDS,
    defaultShelfCount: 1,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['blind-side', 'pull-out-insert'],
  },

  CORNER_DIAGONAL: {
    id: 'CORNER_DIAGONAL',
    category: 'CORNER',
    name: 'Diagonal Corner Cabinet',
    nameTH: 'ตู้มุมเฉียง 45 องศา',
    description: '45-degree corner cabinet with angled front',
    standards: CORNER_CABINET_STANDARDS,
    defaultShelfCount: 2,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['diagonal-door', 'lazy-susan'],
  },

  CORNER_LAZY_SUSAN: {
    id: 'CORNER_LAZY_SUSAN',
    category: 'CORNER',
    name: 'Lazy Susan Corner Cabinet',
    nameTH: 'ตู้มุมถาดหมุน',
    description: 'L-shaped corner with rotating shelves',
    standards: CORNER_CABINET_STANDARDS,
    defaultShelfCount: 0,  // Uses rotating trays instead
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: false,  // Open for mechanism
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['lazy-susan', 'bi-fold-doors'],
  },

  // ============================================
  // APPLIANCE CABINETS (ตู้สำหรับอุปกรณ์)
  // ============================================

  APPLIANCE_OVEN: {
    id: 'APPLIANCE_OVEN',
    category: 'APPLIANCE',
    name: 'Built-in Oven Cabinet',
    nameTH: 'ตู้เตาอบ Built-in',
    description: 'Cabinet for built-in oven with ventilation',
    standards: {
      width: { min: 560, max: 650, default: 600, step: 10 },
      height: { min: 600, max: 900, default: 720, step: 10 },
      depth: { min: 550, max: 600, default: 560, step: 10 },
    },
    defaultShelfCount: 0,
    hasToeKick: true,
    toeKickHeight: 100,
    hasBack: false,  // Ventilation
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-opening', 'heat-resistant', 'ventilation-slots'],
  },

  APPLIANCE_MICROWAVE: {
    id: 'APPLIANCE_MICROWAVE',
    category: 'APPLIANCE',
    name: 'Microwave Cabinet',
    nameTH: 'ตู้ไมโครเวฟ',
    description: 'Cabinet for microwave with ventilation',
    standards: {
      width: { min: 500, max: 700, default: 600, step: 50 },
      height: { min: 350, max: 450, default: 400, step: 25 },
      depth: { min: 350, max: 450, default: 400, step: 25 },
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,  // Ventilation
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-opening', 'ventilation-slots'],
  },

  APPLIANCE_REFRIGERATOR: {
    id: 'APPLIANCE_REFRIGERATOR',
    category: 'APPLIANCE',
    name: 'Refrigerator Surround',
    nameTH: 'ตู้คลุมตู้เย็น',
    description: 'Surround panels for built-in refrigerator look',
    standards: {
      width: { min: 600, max: 1000, default: 900, step: 50 },
      height: { min: 1800, max: 2400, default: 2200, step: 100 },
      depth: { min: 600, max: 700, default: 650, step: 25 },
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-surround', 'top-cabinet-space', 'ventilation'],
  },

  APPLIANCE_WASHER: {
    id: 'APPLIANCE_WASHER',
    category: 'APPLIANCE',
    name: 'Washer/Dryer Cabinet',
    nameTH: 'ตู้เครื่องซักผ้า',
    description: 'Cabinet housing for front-load washer/dryer',
    standards: {
      width: { min: 600, max: 700, default: 650, step: 25 },
      height: { min: 850, max: 1000, default: 900, step: 50 },
      depth: { min: 600, max: 700, default: 650, step: 25 },
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,  // Plumbing/ventilation access
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-opening', 'plumbing-access', 'vibration-dampening'],
  },
};

// ============================================
// ERGONOMIC GUIDELINES
// ============================================

export interface ErgonomicGuidelines {
  counterHeight: number;           // Standard counter height from floor
  backsplashHeight: number;        // Height of backsplash zone
  wallCabinetBottom: number;       // Min height of wall cabinet bottom from floor
  reachableShelfMax: number;       // Max comfortable reach height
  kneeSpace: number;               // Space for sitting/wheelchair
}

export const ERGONOMIC_STANDARDS: ErgonomicGuidelines = {
  counterHeight: 900,              // 900mm = 720 base + 100 toe + 40 counter + 40 clearance
  backsplashHeight: 450,           // 450mm between counter and wall cabinet
  wallCabinetBottom: 1350,         // Min 1350mm from floor to wall cabinet bottom
  reachableShelfMax: 1900,         // Max comfortable reach without stool
  kneeSpace: 600,                  // For wheelchair accessibility (ADA)
};

// ============================================
// VENTILATION REQUIREMENTS
// ============================================

export interface VentilationRequirement {
  applianceType: ApplianceType;
  minClearanceTop: number;         // mm above appliance
  minClearanceBack: number;        // mm behind appliance
  minClearanceSides: number;       // mm on each side
  requiresBackVent: boolean;
  requiresBottomVent: boolean;
  ventSlotArea?: number;           // Required vent area in cm²
}

export const VENTILATION_REQUIREMENTS: Record<ApplianceType, VentilationRequirement> = {
  OVEN: {
    applianceType: 'OVEN',
    minClearanceTop: 50,
    minClearanceBack: 50,
    minClearanceSides: 5,
    requiresBackVent: true,
    requiresBottomVent: false,
    ventSlotArea: 200,
  },
  MICROWAVE: {
    applianceType: 'MICROWAVE',
    minClearanceTop: 30,
    minClearanceBack: 50,
    minClearanceSides: 25,
    requiresBackVent: true,
    requiresBottomVent: false,
    ventSlotArea: 100,
  },
  REFRIGERATOR: {
    applianceType: 'REFRIGERATOR',
    minClearanceTop: 50,
    minClearanceBack: 50,
    minClearanceSides: 10,
    requiresBackVent: true,
    requiresBottomVent: true,
    ventSlotArea: 400,
  },
  DISHWASHER: {
    applianceType: 'DISHWASHER',
    minClearanceTop: 5,
    minClearanceBack: 50,
    minClearanceSides: 5,
    requiresBackVent: false,
    requiresBottomVent: false,
  },
  WASHER: {
    applianceType: 'WASHER',
    minClearanceTop: 25,
    minClearanceBack: 100,
    minClearanceSides: 25,
    requiresBackVent: true,
    requiresBottomVent: false,
    ventSlotArea: 150,
  },
  HOOD: {
    applianceType: 'HOOD',
    minClearanceTop: 50,
    minClearanceBack: 0,
    minClearanceSides: 0,
    requiresBackVent: true,
    requiresBottomVent: false,
  },
};

// ============================================
// CORNER CABINET ALGORITHMS
// ============================================

export interface CornerCabinetParams {
  type: CornerType;
  width: number;               // Face width
  depth: number;               // Depth into corner
  blindOverlap?: number;       // For blind corners
}

/**
 * Calculate Blind Corner Cabinet Dimensions
 *
 * @param faceWidth - Visible face width (typically 900mm)
 * @param blindOverlap - How much cabinet extends past adjacent cabinet (300-450mm)
 * @param depth - Cabinet depth (560mm standard)
 * @returns Panel dimensions for blind corner
 */
export function calculateBlindCorner(
  faceWidth: number = 900,
  blindOverlap: number = 300,
  depth: number = 560
): { totalWidth: number; openingWidth: number; fillerNeeded: number } {
  const totalWidth = faceWidth;
  const openingWidth = faceWidth - blindOverlap;
  const fillerNeeded = blindOverlap + 75; // Standard filler for pull clearance

  return {
    totalWidth,
    openingWidth,
    fillerNeeded,
  };
}

/**
 * Calculate Diagonal Corner Cabinet (45-degree)
 *
 * @param wallToCorner - Distance from wall to corner point
 * @returns Diagonal cabinet dimensions
 */
export function calculateDiagonalCorner(
  wallToCorner: number = 600
): { faceWidth: number; diagonalDepth: number; openingWidth: number } {
  // 45-degree corner: face is at 45 degrees to walls
  // Face width = wallToCorner * sqrt(2)
  const faceWidth = Math.round(wallToCorner * Math.SQRT2);
  const diagonalDepth = wallToCorner;
  const openingWidth = faceWidth - 100; // Door frame allowance

  return {
    faceWidth,
    diagonalDepth,
    openingWidth,
  };
}

/**
 * Calculate Lazy Susan Corner Space
 *
 * @param cabinetWidth - Both sides equal for true corner
 * @param trayDiameter - Lazy susan tray diameter
 * @returns Usable rotating space
 */
export function calculateLazySusanSpace(
  cabinetWidth: number = 900,
  trayDiameter?: number
): { maxTrayDiameter: number; recommendedTray: number; deadCornerSize: number } {
  // Max tray = diagonal of inner corner - clearance
  // Inner corner diagonal = (W - 2*thickness) * sqrt(2)
  const innerWidth = cabinetWidth - 36; // 18mm panels each side
  const maxDiagonal = innerWidth * Math.SQRT2;
  const maxTrayDiameter = Math.floor(maxDiagonal - 50); // 50mm clearance

  // Standard tray sizes: 400, 500, 600, 700, 800mm
  const standardSizes = [400, 500, 600, 700, 800];
  const recommendedTray = standardSizes
    .filter(s => s <= maxTrayDiameter)
    .pop() || 400;

  // Dead corner = space not covered by rotating tray
  const deadCornerSize = Math.round((innerWidth - recommendedTray / 2) * 0.3);

  return {
    maxTrayDiameter,
    recommendedTray,
    deadCornerSize,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get cabinet type by ID
 */
export function getCabinetType(id: string): CabinetTypeDefinition | undefined {
  return CABINET_TYPES[id];
}

/**
 * Get all cabinet types by category
 */
export function getCabinetsByCategory(category: CabinetCategory): CabinetTypeDefinition[] {
  return Object.values(CABINET_TYPES).filter(c => c.category === category);
}

/**
 * Validate dimensions against standards
 */
export function validateDimensions(
  typeId: string,
  width: number,
  height: number,
  depth: number
): { valid: boolean; errors: string[] } {
  const type = CABINET_TYPES[typeId];
  if (!type) {
    return { valid: false, errors: [`Unknown cabinet type: ${typeId}`] };
  }

  const errors: string[] = [];
  const { standards } = type;

  if (width < standards.width.min || width > standards.width.max) {
    errors.push(`Width ${width}mm outside range ${standards.width.min}-${standards.width.max}mm`);
  }
  if (height < standards.height.min || height > standards.height.max) {
    errors.push(`Height ${height}mm outside range ${standards.height.min}-${standards.height.max}mm`);
  }
  if (depth < standards.depth.min || depth > standards.depth.max) {
    errors.push(`Depth ${depth}mm outside range ${standards.depth.min}-${standards.depth.max}mm`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get ventilation requirements for appliance cabinet
 */
export function getVentilationRequirements(applianceType: ApplianceType): VentilationRequirement {
  return VENTILATION_REQUIREMENTS[applianceType];
}

/**
 * Calculate appliance cabinet inner dimensions
 */
export function calculateApplianceOpening(
  applianceType: ApplianceType,
  applianceWidth: number,
  applianceHeight: number,
  applianceDepth: number
): {
  cabinetWidth: number;
  cabinetHeight: number;
  cabinetDepth: number;
  openingWidth: number;
  openingHeight: number;
} {
  const vent = VENTILATION_REQUIREMENTS[applianceType];
  const panelThickness = 18; // Standard panel thickness

  const openingWidth = applianceWidth + (vent.minClearanceSides * 2);
  const openingHeight = applianceHeight + vent.minClearanceTop;

  return {
    cabinetWidth: openingWidth + (panelThickness * 2),
    cabinetHeight: openingHeight + panelThickness, // Top panel only
    cabinetDepth: applianceDepth + vent.minClearanceBack,
    openingWidth,
    openingHeight,
  };
}
