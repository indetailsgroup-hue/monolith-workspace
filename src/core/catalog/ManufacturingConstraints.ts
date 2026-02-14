/**
 * Manufacturing Constraints - Material & Process Specifications
 *
 * ARCHITECTURE (North Star v4.0):
 * - Material-specific processing parameters
 * - CNC tooling specifications
 * - Edge banding machine parameters
 * - Quality control tolerances
 *
 * PURPOSE:
 * Ensures designs are manufacturable with available equipment
 * and materials. These constraints prevent impossible or
 * problematic manufacturing scenarios.
 */

// ============================================
// MATERIAL SPECIFICATIONS
// ============================================

export type BoardMaterial =
  | 'MDF'              // Medium Density Fiberboard
  | 'HMR'              // Moisture Resistant MDF
  | 'PARTICLE_BOARD'   // Standard particle board
  | 'HMR_PARTICLE'     // Moisture resistant particle board
  | 'PLYWOOD_BB'       // B/B grade plywood
  | 'PLYWOOD_BC'       // B/C grade plywood
  | 'PLYWOOD_MARINE'   // Marine grade plywood
  | 'SOLID_WOOD';      // Solid wood (various species)

export type SurfaceMaterialType =
  | 'HPL'              // High Pressure Laminate
  | 'MELAMINE'         // Melamine paper
  | 'VENEER'           // Natural wood veneer
  | 'PVC_FILM'         // PVC decorative film
  | 'ACRYLIC'          // Acrylic sheet
  | 'PAINT';           // Spray lacquer/paint

export type EdgeMaterialType =
  | 'PVC'              // PVC edge tape
  | 'ABS'              // ABS edge tape
  | 'VENEER_TAPE'      // Wood veneer tape
  | 'SOLID_WOOD_EDGE'  // Solid wood lipping
  | 'ALUMINUM';        // Aluminum edge profile

// ============================================
// BOARD MATERIAL CONSTRAINTS
// ============================================

export interface BoardMaterialSpec {
  id: BoardMaterial;
  name: string;
  nameTH: string;

  // Available thicknesses (mm)
  thicknesses: number[];

  // Sheet sizes (mm)
  standardSheets: Array<{ width: number; length: number }>;

  // Processing constraints
  minRoutingDepth: number;       // Minimum groove/dado depth
  maxRoutingDepth: number;       // Maximum before breakthrough
  minEdgeBandingThickness: number;  // Min material for clean edge

  // Structural properties
  screwHoldingFace: number;      // Pull-out strength face (N)
  screwHoldingEdge: number;      // Pull-out strength edge (N)
  bendable: boolean;             // Can be kerf-bent
  moistureResistant: boolean;

  // Cost multiplier (relative to MDF = 1.0)
  costMultiplier: number;
}

export const BOARD_MATERIALS: Record<BoardMaterial, BoardMaterialSpec> = {
  MDF: {
    id: 'MDF',
    name: 'Medium Density Fiberboard',
    nameTH: 'MDF มาตรฐาน',
    thicknesses: [3, 6, 9, 12, 15, 18, 25],
    standardSheets: [
      { width: 1220, length: 2440 },
      { width: 1525, length: 3050 },
    ],
    minRoutingDepth: 3,
    maxRoutingDepth: 15,  // For 18mm board
    minEdgeBandingThickness: 6,
    screwHoldingFace: 1100,
    screwHoldingEdge: 700,
    bendable: true,
    moistureResistant: false,
    costMultiplier: 1.0,
  },

  HMR: {
    id: 'HMR',
    name: 'Moisture Resistant MDF',
    nameTH: 'HMR กันชื้น',
    thicknesses: [6, 9, 12, 15, 18, 25],
    standardSheets: [
      { width: 1220, length: 2440 },
    ],
    minRoutingDepth: 3,
    maxRoutingDepth: 15,
    minEdgeBandingThickness: 6,
    screwHoldingFace: 1000,
    screwHoldingEdge: 650,
    bendable: true,
    moistureResistant: true,
    costMultiplier: 1.3,
  },

  PARTICLE_BOARD: {
    id: 'PARTICLE_BOARD',
    name: 'Particle Board',
    nameTH: 'ไม้ปาร์ติเกิล',
    thicknesses: [12, 15, 18, 25],
    standardSheets: [
      { width: 1220, length: 2440 },
      { width: 1830, length: 2440 },
    ],
    minRoutingDepth: 5,
    maxRoutingDepth: 12,
    minEdgeBandingThickness: 12,
    screwHoldingFace: 800,
    screwHoldingEdge: 400,
    bendable: false,
    moistureResistant: false,
    costMultiplier: 0.7,
  },

  HMR_PARTICLE: {
    id: 'HMR_PARTICLE',
    name: 'Moisture Resistant Particle Board',
    nameTH: 'ไม้ปาร์ติเกิลกันชื้น',
    thicknesses: [12, 15, 18, 25],
    standardSheets: [
      { width: 1220, length: 2440 },
    ],
    minRoutingDepth: 5,
    maxRoutingDepth: 12,
    minEdgeBandingThickness: 12,
    screwHoldingFace: 750,
    screwHoldingEdge: 350,
    bendable: false,
    moistureResistant: true,
    costMultiplier: 0.85,
  },

  PLYWOOD_BB: {
    id: 'PLYWOOD_BB',
    name: 'Plywood B/B Grade',
    nameTH: 'ไม้อัด B/B',
    thicknesses: [4, 6, 9, 12, 15, 18],
    standardSheets: [
      { width: 1220, length: 2440 },
    ],
    minRoutingDepth: 2,
    maxRoutingDepth: 12,
    minEdgeBandingThickness: 4,
    screwHoldingFace: 1400,
    screwHoldingEdge: 1000,
    bendable: true,
    moistureResistant: false,
    costMultiplier: 1.5,
  },

  PLYWOOD_BC: {
    id: 'PLYWOOD_BC',
    name: 'Plywood B/C Grade',
    nameTH: 'ไม้อัด B/C',
    thicknesses: [4, 6, 9, 12, 15, 18],
    standardSheets: [
      { width: 1220, length: 2440 },
    ],
    minRoutingDepth: 2,
    maxRoutingDepth: 12,
    minEdgeBandingThickness: 4,
    screwHoldingFace: 1300,
    screwHoldingEdge: 900,
    bendable: true,
    moistureResistant: false,
    costMultiplier: 1.2,
  },

  PLYWOOD_MARINE: {
    id: 'PLYWOOD_MARINE',
    name: 'Marine Grade Plywood',
    nameTH: 'ไม้อัดทนน้ำ',
    thicknesses: [6, 9, 12, 15, 18],
    standardSheets: [
      { width: 1220, length: 2440 },
    ],
    minRoutingDepth: 2,
    maxRoutingDepth: 12,
    minEdgeBandingThickness: 4,
    screwHoldingFace: 1500,
    screwHoldingEdge: 1100,
    bendable: true,
    moistureResistant: true,
    costMultiplier: 2.5,
  },

  SOLID_WOOD: {
    id: 'SOLID_WOOD',
    name: 'Solid Wood',
    nameTH: 'ไม้จริง',
    thicknesses: [18, 20, 25, 30, 40, 50],
    standardSheets: [
      { width: 150, length: 2400 },  // Boards
      { width: 200, length: 2400 },
      { width: 300, length: 2400 },
    ],
    minRoutingDepth: 3,
    maxRoutingDepth: 25,
    minEdgeBandingThickness: 0,  // No edge banding needed
    screwHoldingFace: 2000,
    screwHoldingEdge: 1500,
    bendable: false,
    moistureResistant: false,  // Depends on species
    costMultiplier: 4.0,
  },
};

// ============================================
// SURFACE MATERIAL CONSTRAINTS
// ============================================

export interface SurfaceMaterialSpec {
  id: SurfaceMaterialType;
  name: string;
  nameTH: string;

  // Thickness range
  thicknessMin: number;
  thicknessMax: number;
  thicknessCommon: number[];

  // Application constraints
  minBendRadius: number | null;   // null = not bendable
  requiresGlue: boolean;
  glueType: string;
  applicationTemp: number;        // Press/application temp (°C)

  // Processing
  canPostform: boolean;           // Can wrap around edges
  canRoute: boolean;              // Can be CNC routed
  requiresSealer: boolean;        // Needs primer/sealer

  // Cost per m²
  costPerSqm: number;
}

export const SURFACE_MATERIALS: Record<SurfaceMaterialType, SurfaceMaterialSpec> = {
  HPL: {
    id: 'HPL',
    name: 'High Pressure Laminate',
    nameTH: 'แผ่น HPL',
    thicknessMin: 0.6,
    thicknessMax: 1.5,
    thicknessCommon: [0.7, 0.8, 1.0],
    minBendRadius: 25,  // Can postform with heat
    requiresGlue: true,
    glueType: 'Contact/PVA',
    applicationTemp: 120,
    canPostform: true,
    canRoute: true,
    requiresSealer: false,
    costPerSqm: 350,
  },

  MELAMINE: {
    id: 'MELAMINE',
    name: 'Melamine Paper',
    nameTH: 'กระดาษเมลามีน',
    thicknessMin: 0.1,
    thicknessMax: 0.3,
    thicknessCommon: [0.2],
    minBendRadius: null,  // Not bendable
    requiresGlue: true,
    glueType: 'UF Resin',
    applicationTemp: 180,
    canPostform: false,
    canRoute: false,  // Burns
    requiresSealer: false,
    costPerSqm: 80,
  },

  VENEER: {
    id: 'VENEER',
    name: 'Natural Wood Veneer',
    nameTH: 'วีเนียร์ไม้จริง',
    thicknessMin: 0.3,
    thicknessMax: 3.0,
    thicknessCommon: [0.5, 0.6, 1.0],
    minBendRadius: 15,
    requiresGlue: true,
    glueType: 'PVA/Contact',
    applicationTemp: 80,
    canPostform: true,
    canRoute: true,
    requiresSealer: true,  // Needs lacquer
    costPerSqm: 500,
  },

  PVC_FILM: {
    id: 'PVC_FILM',
    name: 'PVC Decorative Film',
    nameTH: 'ฟิล์ม PVC',
    thicknessMin: 0.15,
    thicknessMax: 0.5,
    thicknessCommon: [0.18, 0.3],
    minBendRadius: 3,  // Very flexible
    requiresGlue: true,
    glueType: 'Contact/Heat activated',
    applicationTemp: 60,
    canPostform: true,
    canRoute: true,
    requiresSealer: false,
    costPerSqm: 200,
  },

  ACRYLIC: {
    id: 'ACRYLIC',
    name: 'Acrylic Sheet',
    nameTH: 'แผ่นอะคริลิค',
    thicknessMin: 1.0,
    thicknessMax: 3.0,
    thicknessCommon: [1.0, 1.5, 2.0],
    minBendRadius: 100,  // Heat bending only
    requiresGlue: true,
    glueType: 'Acrylic adhesive',
    applicationTemp: 25,
    canPostform: false,
    canRoute: true,
    requiresSealer: false,
    costPerSqm: 800,
  },

  PAINT: {
    id: 'PAINT',
    name: 'Spray Lacquer/Paint',
    nameTH: 'สีพ่น',
    thicknessMin: 0.1,
    thicknessMax: 0.3,
    thicknessCommon: [0.15],
    minBendRadius: null,  // N/A
    requiresGlue: false,
    glueType: 'N/A',
    applicationTemp: 25,
    canPostform: false,
    canRoute: true,
    requiresSealer: true,  // Primer required
    costPerSqm: 400,  // Including labor
  },
};

// ============================================
// EDGE MATERIAL CONSTRAINTS
// ============================================

export interface EdgeMaterialSpec {
  id: EdgeMaterialType;
  name: string;
  nameTH: string;

  // Dimensions
  thicknessMin: number;
  thicknessMax: number;
  thicknessCommon: number[];
  heightMin: number;
  heightMax: number;

  // Application
  requiresGlue: boolean;
  glueType: string;
  applicationMethod: 'machine' | 'manual' | 'both';
  applicationTemp: number;

  // Processing
  requiresTrimming: boolean;
  requiresBuffing: boolean;

  // Cost per meter
  costPerMeter: number;
}

export const EDGE_MATERIALS: Record<EdgeMaterialType, EdgeMaterialSpec> = {
  PVC: {
    id: 'PVC',
    name: 'PVC Edge Band',
    nameTH: 'เอจ PVC',
    thicknessMin: 0.4,
    thicknessMax: 3.0,
    thicknessCommon: [0.5, 1.0, 2.0],
    heightMin: 18,
    heightMax: 54,
    requiresGlue: true,
    glueType: 'EVA Hot Melt',
    applicationMethod: 'both',
    applicationTemp: 180,
    requiresTrimming: true,
    requiresBuffing: true,
    costPerMeter: 15,
  },

  ABS: {
    id: 'ABS',
    name: 'ABS Edge Band',
    nameTH: 'เอจ ABS',
    thicknessMin: 0.4,
    thicknessMax: 3.0,
    thicknessCommon: [0.5, 1.0, 2.0],
    heightMin: 18,
    heightMax: 54,
    requiresGlue: true,
    glueType: 'EVA/PUR Hot Melt',
    applicationMethod: 'machine',
    applicationTemp: 200,
    requiresTrimming: true,
    requiresBuffing: true,
    costPerMeter: 25,
  },

  VENEER_TAPE: {
    id: 'VENEER_TAPE',
    name: 'Veneer Edge Tape',
    nameTH: 'เอจวีเนียร์',
    thicknessMin: 0.3,
    thicknessMax: 1.0,
    thicknessCommon: [0.5, 0.6],
    heightMin: 18,
    heightMax: 40,
    requiresGlue: true,
    glueType: 'PVA/Contact',
    applicationMethod: 'both',
    applicationTemp: 80,
    requiresTrimming: true,
    requiresBuffing: false,
    costPerMeter: 35,
  },

  SOLID_WOOD_EDGE: {
    id: 'SOLID_WOOD_EDGE',
    name: 'Solid Wood Lipping',
    nameTH: 'ขอบไม้จริง',
    thicknessMin: 3.0,
    thicknessMax: 25.0,
    thicknessCommon: [5, 10, 15],
    heightMin: 18,
    heightMax: 100,
    requiresGlue: true,
    glueType: 'PVA Wood Glue',
    applicationMethod: 'manual',
    applicationTemp: 25,
    requiresTrimming: true,
    requiresBuffing: false,
    costPerMeter: 100,
  },

  ALUMINUM: {
    id: 'ALUMINUM',
    name: 'Aluminum Edge Profile',
    nameTH: 'ขอบอลูมิเนียม',
    thicknessMin: 1.0,
    thicknessMax: 3.0,
    thicknessCommon: [1.5, 2.0],
    heightMin: 18,
    heightMax: 30,
    requiresGlue: false,
    glueType: 'N/A (mechanical clip)',
    applicationMethod: 'manual',
    applicationTemp: 25,
    requiresTrimming: false,
    requiresBuffing: false,
    costPerMeter: 150,
  },
};

// ============================================
// CNC MACHINE CONSTRAINTS
// ============================================

export interface CNCMachineConstraints {
  // Table size
  maxWidth: number;              // Max panel width
  maxLength: number;             // Max panel length
  maxThickness: number;          // Max routing depth

  // Tool constraints
  minToolDiameter: number;       // Smallest available bit
  maxToolDiameter: number;       // Largest available bit
  toolChangeTime: number;        // Seconds per tool change

  // Speed limits
  maxFeedRate: number;           // mm/min
  maxSpindleSpeed: number;       // RPM
  minSpindleSpeed: number;       // RPM

  // Accuracy
  positioningAccuracy: number;   // mm
  repeatability: number;         // mm

  // Vacuum
  minPanelSizeForVacuum: number; // Min size for vacuum hold
}

export const DEFAULT_CNC_CONSTRAINTS: CNCMachineConstraints = {
  maxWidth: 1300,
  maxLength: 2500,
  maxThickness: 80,
  minToolDiameter: 3,
  maxToolDiameter: 25,
  toolChangeTime: 8,
  maxFeedRate: 25000,
  maxSpindleSpeed: 24000,
  minSpindleSpeed: 6000,
  positioningAccuracy: 0.02,
  repeatability: 0.01,
  minPanelSizeForVacuum: 200,  // 200x200mm minimum
};

// ============================================
// EDGE BANDING MACHINE CONSTRAINTS
// ============================================

export interface EdgeBanderConstraints {
  // Panel size
  minPanelWidth: number;
  maxPanelWidth: number;
  minPanelLength: number;
  maxPanelLength: number;
  minPanelThickness: number;
  maxPanelThickness: number;

  // Edge tape
  minEdgeThickness: number;
  maxEdgeThickness: number;
  minEdgeHeight: number;
  maxEdgeHeight: number;

  // Processing
  feedSpeed: number;             // m/min
  glueApplicationTemp: number;   // °C
  preMillingAvailable: boolean;
  cornerRoundingAvailable: boolean;
  scraping: boolean;
  buffing: boolean;

  // Accuracy
  jointLineVisibility: number;   // mm (smaller = better)
}

export const DEFAULT_EDGEBANDER_CONSTRAINTS: EdgeBanderConstraints = {
  minPanelWidth: 60,
  maxPanelWidth: 60,       // For edge banding, width is irrelevant
  minPanelLength: 150,
  maxPanelLength: 3000,
  minPanelThickness: 10,
  maxPanelThickness: 60,
  minEdgeThickness: 0.4,
  maxEdgeThickness: 3.0,
  minEdgeHeight: 12,
  maxEdgeHeight: 60,
  feedSpeed: 12,           // 12 m/min typical
  glueApplicationTemp: 200,
  preMillingAvailable: true,
  cornerRoundingAvailable: true,
  scraping: true,
  buffing: true,
  jointLineVisibility: 0.1,
};

// ============================================
// PANEL DIMENSION CONSTRAINTS
// ============================================

export interface PanelDimensionConstraints {
  // Minimum sizes (for structural integrity)
  minWidth: number;
  minHeight: number;

  // Maximum sizes (limited by material sheets)
  maxWidth: number;
  maxHeight: number;

  // Increments (for standard sizing)
  widthStep: number;
  heightStep: number;

  // Tolerances
  cutTolerance: number;          // ±mm on cut
  assembleTolerance: number;     // ±mm on assembly
}

export const PANEL_DIMENSION_CONSTRAINTS: PanelDimensionConstraints = {
  minWidth: 50,
  minHeight: 50,
  maxWidth: 2400,           // Standard sheet max
  maxHeight: 1200,          // Standard sheet max
  widthStep: 1,             // 1mm increments
  heightStep: 1,            // 1mm increments
  cutTolerance: 0.5,        // ±0.5mm
  assembleTolerance: 1.0,   // ±1mm
};

// ============================================
// CNC TOOL GEOMETRY EFFECTS
// ============================================

/**
 * CNC Tool Profile Types
 *
 * FLAT (Flat End Mill):
 * - Square bottom cut
 * - Sharp corners at groove bottom
 * - Fastest cutting, best for dados/grooves
 * - Higher stress concentration in kerf bending
 *
 * BALL_NOSE (Ball End Mill):
 * - Rounded bottom cut
 * - No sharp corners
 * - Better for kerf bending (less stress)
 * - Requires more passes for flat-bottom grooves
 *
 * V_BIT (V-Groove Bit):
 * - Tapered cut with pointed bottom
 * - Used for chamfers, V-grooves, engraving
 * - Depth determines width of cut
 *
 * COMPRESSION (Compression Spiral):
 * - Up-cut at bottom, down-cut at top
 * - Clean cut on both faces
 * - Best for laminates/veneered panels
 *
 * STRAIGHT (Straight Flute):
 * - No spiral, straight flutes
 * - Less aggressive cut
 * - Good for soft materials
 */
export type CNCToolProfile =
  | 'FLAT'
  | 'BALL_NOSE'
  | 'V_BIT'
  | 'COMPRESSION'
  | 'STRAIGHT';

export interface CNCToolSpec {
  profile: CNCToolProfile;
  name: string;
  nameTH: string;

  // Physical dimensions
  diameter: number;         // Tool diameter (mm)
  cuttingLength: number;    // Usable cutting length (mm)
  shankDiameter: number;    // Shank diameter (mm)
  fluteCount: number;       // Number of cutting edges

  // For V-bits
  vAngle?: number;          // V-bit angle (degrees)

  // Performance characteristics
  chipLoad: number;         // mm per tooth (typical for wood-based materials)
  maxDepthPerPass: number;  // Maximum cut depth per pass (mm)
  maxFeedRate: number;      // Maximum feed rate (mm/min)

  // Best applications
  bestFor: string[];
  avoidFor: string[];
}

export const COMMON_CNC_TOOLS: Record<string, CNCToolSpec> = {
  // Flat End Mills
  FLAT_3MM: {
    profile: 'FLAT',
    name: '3mm Flat End Mill',
    nameTH: 'ดอกกัดปลายเรียบ 3mm',
    diameter: 3,
    cuttingLength: 12,
    shankDiameter: 3,
    fluteCount: 2,
    chipLoad: 0.05,
    maxDepthPerPass: 6,
    maxFeedRate: 3000,
    bestFor: ['Small grooves', 'Detail work', 'Narrow dadoes'],
    avoidFor: ['Large material removal', 'Deep pockets'],
  },
  FLAT_6MM: {
    profile: 'FLAT',
    name: '6mm Flat End Mill',
    nameTH: 'ดอกกัดปลายเรียบ 6mm',
    diameter: 6,
    cuttingLength: 22,
    shankDiameter: 6,
    fluteCount: 2,
    chipLoad: 0.1,
    maxDepthPerPass: 12,
    maxFeedRate: 4000,
    bestFor: ['General purpose', 'Dadoes', 'Rabbets', 'Pockets'],
    avoidFor: ['Fine detail work'],
  },
  FLAT_8MM: {
    profile: 'FLAT',
    name: '8mm Flat End Mill',
    nameTH: 'ดอกกัดปลายเรียบ 8mm',
    diameter: 8,
    cuttingLength: 25,
    shankDiameter: 8,
    fluteCount: 2,
    chipLoad: 0.12,
    maxDepthPerPass: 16,
    maxFeedRate: 5000,
    bestFor: ['Efficient material removal', 'Wide grooves', 'Through cuts'],
    avoidFor: ['Tight corners', 'Detail work'],
  },

  // Ball Nose End Mills
  BALL_3MM: {
    profile: 'BALL_NOSE',
    name: '3mm Ball Nose',
    nameTH: 'ดอกกัดปลายมน 3mm',
    diameter: 3,
    cuttingLength: 15,
    shankDiameter: 3,
    fluteCount: 2,
    chipLoad: 0.04,
    maxDepthPerPass: 4,
    maxFeedRate: 2500,
    bestFor: ['3D carving', 'Kerf bending', 'Rounded grooves', 'Contours'],
    avoidFor: ['Flat-bottom grooves', 'Dadoes'],
  },
  BALL_6MM: {
    profile: 'BALL_NOSE',
    name: '6mm Ball Nose',
    nameTH: 'ดอกกัดปลายมน 6mm',
    diameter: 6,
    cuttingLength: 22,
    shankDiameter: 6,
    fluteCount: 2,
    chipLoad: 0.08,
    maxDepthPerPass: 10,
    maxFeedRate: 3500,
    bestFor: ['Kerf bending', '3D surfacing', 'Relief carving'],
    avoidFor: ['Flat surfaces', 'Square grooves'],
  },

  // V-Bits
  V_60: {
    profile: 'V_BIT',
    name: '60° V-Bit',
    nameTH: 'ดอก V 60 องศา',
    diameter: 6,
    cuttingLength: 20,
    shankDiameter: 6,
    fluteCount: 2,
    vAngle: 60,
    chipLoad: 0.06,
    maxDepthPerPass: 5,
    maxFeedRate: 2000,
    bestFor: ['Chamfers', 'V-grooves', 'Lettering', 'Engraving'],
    avoidFor: ['Flat cuts', 'Through cuts'],
  },
  V_90: {
    profile: 'V_BIT',
    name: '90° V-Bit',
    nameTH: 'ดอก V 90 องศา',
    diameter: 6,
    cuttingLength: 20,
    shankDiameter: 6,
    fluteCount: 2,
    vAngle: 90,
    chipLoad: 0.06,
    maxDepthPerPass: 6,
    maxFeedRate: 2500,
    bestFor: ['45° chamfers', 'Wide V-grooves', 'Decorative edges'],
    avoidFor: ['Deep narrow grooves', 'Flat cuts'],
  },

  // Compression Bits
  COMPRESSION_6MM: {
    profile: 'COMPRESSION',
    name: '6mm Compression',
    nameTH: 'ดอกกัด Compression 6mm',
    diameter: 6,
    cuttingLength: 22,
    shankDiameter: 6,
    fluteCount: 2,
    chipLoad: 0.1,
    maxDepthPerPass: 18,  // Full thickness for clean cut both sides
    maxFeedRate: 4000,
    bestFor: ['Laminated panels', 'Veneered MDF', 'Clean both sides'],
    avoidFor: ['Grooves (doesn\'t clear chips)', 'Partial depth cuts'],
  },

  // Straight Flute
  STRAIGHT_6MM: {
    profile: 'STRAIGHT',
    name: '6mm Straight Flute',
    nameTH: 'ดอกกัดร่องตรง 6mm',
    diameter: 6,
    cuttingLength: 20,
    shankDiameter: 6,
    fluteCount: 2,
    chipLoad: 0.08,
    maxDepthPerPass: 8,
    maxFeedRate: 3000,
    bestFor: ['Soft materials', 'Foam', 'Plastics', 'Template routing'],
    avoidFor: ['Hard materials', 'Deep pockets'],
  },
};

/**
 * Tool Geometry Impact on Kerf Bending
 *
 * Analysis of how different tool profiles affect kerf bend quality
 */
export interface KerfToolImpact {
  tool: CNCToolProfile;
  stressConcentration: 'LOW' | 'MEDIUM' | 'HIGH';
  recommendedWebIncrease: number;  // mm to add to web thickness
  bendQuality: 'EXCELLENT' | 'GOOD' | 'FAIR';
  notes: string[];
}

export function analyzeKerfToolImpact(
  toolProfile: CNCToolProfile,
  materialType: BoardMaterial
): KerfToolImpact {
  const notes: string[] = [];

  // Base analysis by tool profile
  const impactByProfile: Record<CNCToolProfile, Omit<KerfToolImpact, 'notes'>> = {
    FLAT: {
      tool: 'FLAT',
      stressConcentration: 'HIGH',
      recommendedWebIncrease: 0.5,
      bendQuality: 'FAIR',
    },
    BALL_NOSE: {
      tool: 'BALL_NOSE',
      stressConcentration: 'LOW',
      recommendedWebIncrease: 0,
      bendQuality: 'EXCELLENT',
    },
    V_BIT: {
      tool: 'V_BIT',
      stressConcentration: 'MEDIUM',
      recommendedWebIncrease: 0.3,
      bendQuality: 'GOOD',
    },
    COMPRESSION: {
      tool: 'COMPRESSION',
      stressConcentration: 'HIGH',
      recommendedWebIncrease: 0.5,
      bendQuality: 'FAIR',
    },
    STRAIGHT: {
      tool: 'STRAIGHT',
      stressConcentration: 'MEDIUM',
      recommendedWebIncrease: 0.3,
      bendQuality: 'GOOD',
    },
  };

  const baseImpact = impactByProfile[toolProfile];

  // Material-specific notes
  if (materialType === 'PARTICLE_BOARD' && toolProfile === 'FLAT') {
    notes.push('HIGH RISK: Flat end mill + particle board = high crack risk');
    notes.push('Strongly recommend ball-nose for particle board kerf bending');
  }

  if (toolProfile === 'BALL_NOSE') {
    notes.push('Ball-nose creates rounded kerf bottom, reducing stress concentration');
    notes.push('Ideal for tight-radius bends and brittle materials');
  }

  if (toolProfile === 'FLAT') {
    notes.push('Square corners at kerf bottom create stress concentration points');
    notes.push('Consider increasing web thickness or using ball-nose');
    notes.push('Faster cutting but higher risk of cracking during bend');
  }

  if (toolProfile === 'V_BIT') {
    notes.push('V-groove kerf has tapered sides, partially reducing stress');
    notes.push('Kerf width varies with depth - calculate carefully');
  }

  return {
    ...baseImpact,
    notes,
  };
}

/**
 * Calculate feed and speed for given tool and material
 */
export function calculateFeedAndSpeed(
  toolId: string,
  material: BoardMaterial,
  cutType: 'PROFILE' | 'POCKET' | 'GROOVE' | 'KERF'
): {
  feedRate: number;      // mm/min
  spindleSpeed: number;  // RPM
  depthPerPass: number;  // mm
  stepover: number;      // mm (for pocket operations)
  notes: string[];
} {
  const tool = COMMON_CNC_TOOLS[toolId];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolId}`);
  }

  const matSpec = BOARD_MATERIALS[material];
  const notes: string[] = [];

  // Base spindle speed (18000 RPM is common for wood CNC)
  let spindleSpeed = 18000;

  // Adjust for material
  if (material === 'SOLID_WOOD') {
    spindleSpeed = 16000;
  } else if (material === 'PARTICLE_BOARD') {
    spindleSpeed = 14000;  // Slower for dusty material
  }

  // Calculate feed rate: Feed = RPM × Flutes × Chip Load
  let feedRate = spindleSpeed * tool.fluteCount * tool.chipLoad;

  // Adjust for cut type
  if (cutType === 'POCKET') {
    feedRate *= 0.8;  // Slower for full-width cuts
    notes.push('Reduced feed for pocket operation - full tool engagement');
  } else if (cutType === 'KERF') {
    feedRate *= 0.9;  // Slightly slower for precision
    notes.push('Slightly reduced feed for kerf precision');
  }

  // Cap at tool maximum
  feedRate = Math.min(feedRate, tool.maxFeedRate);

  // Depth per pass
  let depthPerPass = tool.maxDepthPerPass;
  if (cutType === 'KERF') {
    // For kerf bending, often want full depth in one pass
    // but limit to 80% of tool cutting length
    depthPerPass = tool.cuttingLength * 0.8;
    notes.push('Kerf bending typically uses single-pass cuts');
  }

  // Stepover for pockets (50% of diameter is common)
  const stepover = tool.diameter * 0.5;

  return {
    feedRate: Math.round(feedRate),
    spindleSpeed,
    depthPerPass: Math.round(depthPerPass * 10) / 10,
    stepover: Math.round(stepover * 10) / 10,
    notes,
  };
}

/**
 * Get recommended tool for kerf bending
 */
export function getRecommendedKerfTool(
  kerfWidth: number,
  materialType: BoardMaterial,
  bendRadius: number,
  panelThickness: number
): {
  recommendedToolId: string;
  alternativeToolIds: string[];
  reasoning: string;
} {
  // Calculate risk level
  const isTightBend = bendRadius < panelThickness * 8;
  const isBrittleMaterial = materialType === 'PARTICLE_BOARD' || materialType === 'HMR_PARTICLE';

  let recommendedToolId: string;
  let alternativeToolIds: string[];
  let reasoning: string;

  if (isTightBend || isBrittleMaterial) {
    // Recommend ball-nose for stress reduction
    if (kerfWidth <= 4) {
      recommendedToolId = 'BALL_3MM';
      alternativeToolIds = ['FLAT_3MM', 'V_60'];
    } else {
      recommendedToolId = 'BALL_6MM';
      alternativeToolIds = ['FLAT_6MM', 'V_90'];
    }
    reasoning = isTightBend
      ? 'Tight bend radius - ball-nose reduces crack risk at kerf corners'
      : 'Brittle material - ball-nose reduces stress concentration';
  } else {
    // Standard flat end mill is fine for easier bends
    if (kerfWidth <= 4) {
      recommendedToolId = 'FLAT_3MM';
      alternativeToolIds = ['BALL_3MM'];
    } else {
      recommendedToolId = 'FLAT_6MM';
      alternativeToolIds = ['BALL_6MM', 'FLAT_8MM'];
    }
    reasoning = 'Standard conditions - flat end mill provides fastest cutting';
  }

  return {
    recommendedToolId,
    alternativeToolIds,
    reasoning,
  };
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Check if panel dimensions are within manufacturing limits
 */
export function validatePanelDimensions(
  width: number,
  height: number,
  thickness: number,
  material: BoardMaterial
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const matSpec = BOARD_MATERIALS[material];
  const constraints = PANEL_DIMENSION_CONSTRAINTS;

  if (width < constraints.minWidth) {
    errors.push(`Width ${width}mm below minimum ${constraints.minWidth}mm`);
  }
  if (height < constraints.minHeight) {
    errors.push(`Height ${height}mm below minimum ${constraints.minHeight}mm`);
  }
  if (width > constraints.maxWidth) {
    errors.push(`Width ${width}mm exceeds maximum ${constraints.maxWidth}mm`);
  }
  if (height > constraints.maxHeight) {
    errors.push(`Height ${height}mm exceeds maximum ${constraints.maxHeight}mm`);
  }

  if (!matSpec.thicknesses.includes(thickness)) {
    errors.push(`Thickness ${thickness}mm not available for ${material}. Available: ${matSpec.thicknesses.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if routing parameters are safe for material
 */
export function validateRoutingDepth(
  depth: number,
  panelThickness: number,
  material: BoardMaterial
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  const matSpec = BOARD_MATERIALS[material];

  const remainingThickness = panelThickness - depth;

  if (depth < matSpec.minRoutingDepth) {
    warnings.push(`Routing depth ${depth}mm may be too shallow for ${material}`);
  }

  if (remainingThickness < matSpec.minEdgeBandingThickness) {
    warnings.push(`Only ${remainingThickness}mm remaining after routing - may affect structural integrity`);
  }

  if (depth > matSpec.maxRoutingDepth) {
    warnings.push(`Routing depth ${depth}mm exceeds recommended max ${matSpec.maxRoutingDepth}mm for ${material}`);
  }

  return { valid: warnings.length === 0, warnings };
}

/**
 * Calculate optimal sheet utilization
 */
export function calculateSheetUtilization(
  panels: Array<{ width: number; height: number; quantity: number }>,
  material: BoardMaterial
): {
  sheetsNeeded: number;
  utilization: number;
  waste: number;
  suggestions: string[];
} {
  const matSpec = BOARD_MATERIALS[material];
  const sheet = matSpec.standardSheets[0]; // Use first (most common) sheet size

  // Simple area calculation (actual nesting would be more complex)
  const totalPanelArea = panels.reduce(
    (sum, p) => sum + (p.width * p.height * p.quantity),
    0
  );

  const sheetArea = sheet.width * sheet.length;
  const sheetsNeeded = Math.ceil(totalPanelArea / (sheetArea * 0.85)); // Assume 85% efficiency

  const utilization = (totalPanelArea / (sheetsNeeded * sheetArea)) * 100;
  const waste = (sheetsNeeded * sheetArea) - totalPanelArea;

  const suggestions: string[] = [];
  if (utilization < 70) {
    suggestions.push('Consider combining with other projects to improve utilization');
  }
  if (utilization < 60) {
    suggestions.push('Review panel sizes - some may benefit from slight adjustments');
  }

  return {
    sheetsNeeded,
    utilization: Math.round(utilization * 10) / 10,
    waste: Math.round(waste),
    suggestions,
  };
}

/**
 * Get recommended edge material for board/surface combination
 */
export function getRecommendedEdge(
  boardMaterial: BoardMaterial,
  surfaceMaterial: SurfaceMaterialType
): EdgeMaterialType[] {
  // Surface-matching recommendations
  const recommendations: Record<SurfaceMaterialType, EdgeMaterialType[]> = {
    HPL: ['PVC', 'ABS'],
    MELAMINE: ['PVC'],
    VENEER: ['VENEER_TAPE', 'SOLID_WOOD_EDGE'],
    PVC_FILM: ['PVC'],
    ACRYLIC: ['ALUMINUM', 'ABS'],
    PAINT: ['PVC', 'ABS', 'SOLID_WOOD_EDGE'],
  };

  return recommendations[surfaceMaterial] || ['PVC'];
}
