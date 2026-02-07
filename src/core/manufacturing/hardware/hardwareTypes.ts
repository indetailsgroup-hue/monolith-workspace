/**
 * Hardware Types - Manufacturing Hardware Definitions
 *
 * Defines types for cabinet hardware (Minifix, hinges, dowels, etc.)
 * and their associated manufacturing operations.
 *
 * Inspired by Indetails Smart hardware system.
 *
 * v1.0: Initial implementation
 */

// ============================================
// HARDWARE KINDS
// ============================================

export type HardwareKind =
  | 'HINGE'           // Concealed hinges (35mm cup)
  | 'SHELF_PIN'       // Shelf support pins (5mm)
  | 'MINIFIX'         // Minifix cam connector
  | 'DOWEL'           // Wood dowels (8mm)
  | 'CONFIRMAT'       // Confirmat screws
  | 'SLIDE'           // Drawer slides
  | 'SOFT_CLOSE'      // Soft close dampers
  | 'HANDLE'          // Door/drawer handles
  | 'LIGHTING';       // LED lighting

// ============================================
// MANUFACTURING OPERATIONS
// ============================================

export type MfgOpType = 'DRILL' | 'POCKET' | 'ROUTE' | 'BORE';

export interface MfgOp {
  /** Operation type */
  type: MfgOpType;
  /** X position in mm (from panel origin) */
  x: number;
  /** Y position in mm (from panel origin) */
  y: number;
  /** Z depth in mm (positive = into material) */
  z?: number;
  /** Hole diameter in mm */
  dia?: number;
  /** For pockets/routes - width */
  w?: number;
  /** For pockets/routes - height */
  h?: number;
  /** For routes - path points */
  path?: Array<{ x: number; y: number }>;
  /** Face to drill (A = top/inside, B = bottom/outside) */
  face: 'A' | 'B';
  /** Tool ID for CNC */
  toolId?: string;
  /** Edge to drill (for edge drilling) */
  edge?: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT' | 'FRONT' | 'BACK';
}

// ============================================
// HARDWARE CONTEXT
// ============================================

export interface HardwareCtx {
  /** Panel logical width in mm */
  width: number;
  /** Panel logical height in mm */
  height: number;
  /** Panel thickness in mm */
  thickness: number;
  /** Estimated panel weight in kg (for hinge count) */
  weight: number;
  /** Part tags for filtering (e.g., 'TYPE:DOOR', 'TYPE:SIDE_PANEL') */
  tags: string[];
  /** Panel role */
  role: string;
  /** CAM specification */
  spec?: CamSpec;
}

// ============================================
// CAM SPECIFICATION
// ============================================

export interface CamSpec {
  // System 32 settings
  system32Pitch: number;           // 32mm
  system32StartOffset: number;     // Typically 37mm from front

  // Shelf pin settings
  shelfPinDia: number;             // 5mm
  shelfPinDepth: number;           // 12mm
  shelfPinInsetX: number;          // Distance from edge (e.g., 37mm)
  shelfPinInsetYTop: number;       // Distance from top
  shelfPinInsetYBottom: number;    // Distance from bottom

  // Hinge settings
  hingeCupDia: number;             // 35mm
  hingeCupDepth: number;           // 12.5mm
  hingeCupInsetX: number;          // Distance from hinge edge
  hingeCupInsetY: number;          // Distance from top/bottom
  hingeCupMinEdge: number;         // Minimum edge distance
  hingeSide: 'left' | 'right';     // Default hinge side

  // Minifix settings
  minifixCamDia: number;           // 15mm
  minifixCamDepth: number;         // 13.5mm for 18mm wood
  minifixBoltDia: number;          // 10mm (S200 sleeve diameter)
  minifixBoltLength: number;       // 31mm (S200 shaft length)
  minifixBallHeadDia: number;      // 6.5mm (S200 ball head per Häfele catalog)
  minifixSleeveDia: number;        // 10mm (S200 sleeve)
  minifixSleeveLength: number;     // 17.5mm (S200 sleeve length)
  minifixShaftDia: number;         // 6mm (S200 threaded shaft)
  minifixDowelDia: number;         // 8mm
  minifixDowelLength: number;      // 30mm
  minifixEdgeDistance: number;     // Distance from panel edge (System 32)
  minifixSpacing: number;          // Spacing between minifix pairs (4× System 32)

  // Confirmat settings
  confirmatPilotDia: number;       // 5mm
  confirmatCountersinkDia: number; // 7mm

  // Edge drilling
  edgeDrillMinThickness: number;   // Minimum panel thickness for edge drilling
}

// ============================================
// DEFAULT CAM SPEC
// ============================================

export const DEFAULT_CAM_SPEC: CamSpec = {
  // System 32
  system32Pitch: 32,
  system32StartOffset: 37,

  // Shelf pins
  shelfPinDia: 5,
  shelfPinDepth: 12,
  shelfPinInsetX: 37,
  shelfPinInsetYTop: 50,
  shelfPinInsetYBottom: 50,

  // Hinges
  hingeCupDia: 35,
  hingeCupDepth: 12.5,
  hingeCupInsetX: 22.5,
  hingeCupInsetY: 100,
  hingeCupMinEdge: 75,
  hingeSide: 'left',

  // Minifix / S200 Bolt (from CAD reference)
  minifixCamDia: 15,
  minifixCamDepth: 13.5,     // 13.5mm for 18mm wood per Häfele FF 3.10
  minifixBoltDia: 10, // S200 Sleeve diameter
  minifixBoltLength: 31, // S200 shaft length
  minifixBallHeadDia: 6.5, // S200 ball head Ø6.5mm per Häfele catalog
  minifixSleeveDia: 10, // S200 sleeve
  minifixSleeveLength: 17.5, // S200 sleeve length
  minifixShaftDia: 6, // S200 threaded shaft
  minifixDowelDia: 8,
  minifixDowelLength: 30,
  minifixEdgeDistance: 32, // System 32 edge distance
  minifixSpacing: 128, // 4x System 32 (from CAD: A>400mm layout)

  // Confirmat
  confirmatPilotDia: 5,
  confirmatCountersinkDia: 7,

  // Edge drilling
  edgeDrillMinThickness: 16,
};

// ============================================
// HARDWARE PRESET
// ============================================

export interface HardwarePreset {
  /** Unique preset ID */
  id: string;
  /** Hardware kind */
  kind: HardwareKind;
  /** Display name */
  name: string;
  /** Thai display name */
  nameTh?: string;

  /**
   * Check if this preset applies to the given panel context
   */
  matches: (ctx: HardwareCtx) => boolean;

  /**
   * Generate manufacturing operations for this hardware
   */
  generate: (ctx: HardwareCtx) => MfgOp[];
}

// ============================================
// HARDWARE LIBRARY
// ============================================

export interface HardwareLibrary {
  /** Library ID */
  id: string;
  /** Library name */
  name: string;
  /** Version */
  version: string;
  /** Available presets */
  presets: HardwarePreset[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get tag value from tags array (e.g., 'TYPE:DOOR' => 'DOOR')
 */
export function getTagValue(tags: string[], prefix: string): string | undefined {
  const tag = tags.find((t) => t.startsWith(prefix + ':'));
  return tag?.split(':')[1];
}

/**
 * Check if tags array contains a specific tag
 */
export function hasTag(tags: string[], val: string): boolean {
  return tags.includes(val);
}

/**
 * Snap a position to System 32 grid
 */
export function snapToSystem32(pos: number, startOffset: number = 37): number {
  const pitch = 32;
  const relativePos = pos - startOffset;
  const gridIndex = Math.round(relativePos / pitch);
  return startOffset + gridIndex * pitch;
}

/**
 * Calculate required number of hinges based on door height and weight
 */
export function calculateRequiredHinges(heightMm: number, weightKg: number): number {
  // Standard rule: 2 hinges up to 1000mm, +1 per 500mm after
  // Also consider weight: +1 hinge per 20kg over 15kg
  const heightHinges = heightMm <= 1000 ? 2 : 2 + Math.ceil((heightMm - 1000) / 500);
  const weightHinges = weightKg <= 15 ? 0 : Math.ceil((weightKg - 15) / 20);
  return Math.max(2, heightHinges + weightHinges);
}
