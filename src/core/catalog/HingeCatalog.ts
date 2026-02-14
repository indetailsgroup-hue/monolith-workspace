/**
 * Hinge Hardware Catalog
 *
 * Cabinet door hinge specifications for common European hinge systems.
 * Supports Blum Clip Top, Hettich Sensys, and Grass Tiomos.
 *
 * ARCHITECTURE NOTE:
 * Like MinifixHardware.ts, this catalog serves TWO DOMAINS:
 * 1. Assembly Preview (O_hardware) - Visual dimensions for 3D preview
 * 2. CNC Manufacturing (O_panel) - Drilling parameters for boring machines
 *
 * @version 1.0.0
 */

// ============================================
// HINGE TYPES
// ============================================

/**
 * Hinge brand/system types
 */
export type HingeType =
  | 'CLIP_TOP'      // Blum Clip Top
  | 'CLIP_TOP_BLUMOTION'  // Blum Clip Top with Blumotion
  | 'SENSYS'        // Hettich Sensys
  | 'SENSYS_SILENT' // Hettich Sensys with Silent System
  | 'TIOMOS'        // Grass Tiomos
  | 'TIOMOS_SOFT';  // Grass Tiomos Soft-close

/**
 * Overlay types for hinge mounting
 */
export type HingeOverlayType =
  | 'FULL'    // Full overlay (door covers entire side panel)
  | 'HALF'    // Half overlay (two doors share one side panel)
  | 'INSET';  // Inset (door sits inside cabinet frame)

/**
 * Opening angle options
 */
export type HingeOpeningAngle = 95 | 107 | 110 | 120 | 155 | 170;

// ============================================
// HINGE SPECIFICATIONS
// ============================================

export interface HingeSpec {
  id: string;
  type: HingeType;
  name: string;
  nameTH: string;
  brand: 'Blum' | 'Hettich' | 'Grass';
  articleCode: string;

  // Cup specifications (boring)
  cupDiameter: number;        // Standard 35mm for European hinges
  cupDepth: number;           // Boring depth into door (mm)
  cupCenterToEdge: number;    // Distance from cup center to door edge (mm)

  // Overlay settings
  overlay: HingeOverlayType;
  overlayAdjustment: number;  // Overlay dimension (mm)
  overlayRange: [number, number];  // Min/max adjustment range

  // Opening angle
  openingAngle: HingeOpeningAngle;

  // Mounting plate
  plateType: 'CLIP' | 'SCREW' | 'DOWEL';
  plateHeight: number;        // Mounting plate height (mm)
  plateHoleSpacing: number;   // Distance between mounting holes (mm)
  plateHoleDiameter: number;  // Mounting hole diameter (mm)

  // Soft-close
  hasSoftClose: boolean;
  softCloseType?: 'INTEGRATED' | 'ADD_ON';

  // Load capacity
  maxDoorWeight: number;      // Maximum door weight (kg)
  maxDoorWidth: number;       // Maximum door width (mm)
  maxDoorHeight: number;      // Maximum door height (mm)

  // Adjustments (3-way)
  adjustmentSide: number;     // Side adjustment range (±mm)
  adjustmentHeight: number;   // Height adjustment range (±mm)
  adjustmentDepth: number;    // Depth adjustment range (±mm)

  // Best applications
  bestFor: string[];
}

// ============================================
// HINGE CATALOG - Blum Clip Top
// ============================================

export const BLUM_CLIP_TOP_HINGES: HingeSpec[] = [
  {
    id: 'CLIP_TOP_FULL_110',
    type: 'CLIP_TOP',
    name: 'Clip Top 110° Full Overlay',
    nameTH: 'คลิปท็อป 110° เต็มบาน',
    brand: 'Blum',
    articleCode: '71T3550',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'FULL',
    overlayAdjustment: 16,
    overlayRange: [14, 18],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,  // 0mm plate (INSERTA)
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: false,
    maxDoorWeight: 30,
    maxDoorWidth: 600,
    maxDoorHeight: 2200,
    adjustmentSide: 2,
    adjustmentHeight: 3,
    adjustmentDepth: 3,
    bestFor: ['Standard cabinets', 'Overlay doors', 'Medium-weight doors'],
  },
  {
    id: 'CLIP_TOP_HALF_110',
    type: 'CLIP_TOP',
    name: 'Clip Top 110° Half Overlay',
    nameTH: 'คลิปท็อป 110° ครึ่งบาน',
    brand: 'Blum',
    articleCode: '71T3650',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'HALF',
    overlayAdjustment: 8,
    overlayRange: [6, 10],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: false,
    maxDoorWeight: 30,
    maxDoorWidth: 600,
    maxDoorHeight: 2200,
    adjustmentSide: 2,
    adjustmentHeight: 3,
    adjustmentDepth: 3,
    bestFor: ['Double doors', 'Shared panels', 'Corner cabinets'],
  },
  {
    id: 'CLIP_TOP_INSET_110',
    type: 'CLIP_TOP',
    name: 'Clip Top 110° Inset',
    nameTH: 'คลิปท็อป 110° ฝัง',
    brand: 'Blum',
    articleCode: '71T3750',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'INSET',
    overlayAdjustment: -1,
    overlayRange: [-3, 1],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: false,
    maxDoorWeight: 30,
    maxDoorWidth: 600,
    maxDoorHeight: 2200,
    adjustmentSide: 2,
    adjustmentHeight: 3,
    adjustmentDepth: 3,
    bestFor: ['Inset doors', 'Face frame cabinets', 'Traditional style'],
  },
];

// ============================================
// HINGE CATALOG - Blum Clip Top Blumotion
// ============================================

export const BLUM_BLUMOTION_HINGES: HingeSpec[] = [
  {
    id: 'CLIP_TOP_BM_FULL_110',
    type: 'CLIP_TOP_BLUMOTION',
    name: 'Clip Top Blumotion 110° Full Overlay',
    nameTH: 'คลิปท็อป บลูโมชัน 110° เต็มบาน',
    brand: 'Blum',
    articleCode: '71B3550',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'FULL',
    overlayAdjustment: 16,
    overlayRange: [14, 18],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: true,
    softCloseType: 'INTEGRATED',
    maxDoorWeight: 30,
    maxDoorWidth: 600,
    maxDoorHeight: 2200,
    adjustmentSide: 2,
    adjustmentHeight: 3,
    adjustmentDepth: 3,
    bestFor: ['Premium cabinets', 'Soft-close required', 'Kitchen cabinets'],
  },
  {
    id: 'CLIP_TOP_BM_FULL_155',
    type: 'CLIP_TOP_BLUMOTION',
    name: 'Clip Top Blumotion 155° Full Overlay',
    nameTH: 'คลิปท็อป บลูโมชัน 155° เต็มบาน',
    brand: 'Blum',
    articleCode: '79B3556',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'FULL',
    overlayAdjustment: 16,
    overlayRange: [14, 18],
    openingAngle: 155,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: true,
    softCloseType: 'INTEGRATED',
    maxDoorWeight: 25,
    maxDoorWidth: 500,
    maxDoorHeight: 2000,
    adjustmentSide: 2,
    adjustmentHeight: 3,
    adjustmentDepth: 3,
    bestFor: ['Wide opening access', 'Corner cabinets', 'Accessibility'],
  },
];

// ============================================
// HINGE CATALOG - Hettich Sensys
// ============================================

export const HETTICH_SENSYS_HINGES: HingeSpec[] = [
  {
    id: 'SENSYS_FULL_110',
    type: 'SENSYS',
    name: 'Sensys 110° Full Overlay',
    nameTH: 'เซนซิส 110° เต็มบาน',
    brand: 'Hettich',
    articleCode: '9071204',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'FULL',
    overlayAdjustment: 17,
    overlayRange: [15, 19],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: false,
    maxDoorWeight: 32,
    maxDoorWidth: 600,
    maxDoorHeight: 2400,
    adjustmentSide: 3,
    adjustmentHeight: 3,
    adjustmentDepth: 2,
    bestFor: ['High volume production', 'Standard applications'],
  },
  {
    id: 'SENSYS_SILENT_FULL_110',
    type: 'SENSYS_SILENT',
    name: 'Sensys Silent System 110° Full Overlay',
    nameTH: 'เซนซิส ไซเลนท์ 110° เต็มบาน',
    brand: 'Hettich',
    articleCode: '9071224',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'FULL',
    overlayAdjustment: 17,
    overlayRange: [15, 19],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: true,
    softCloseType: 'INTEGRATED',
    maxDoorWeight: 32,
    maxDoorWidth: 600,
    maxDoorHeight: 2400,
    adjustmentSide: 3,
    adjustmentHeight: 3,
    adjustmentDepth: 2,
    bestFor: ['Premium cabinets', 'Noise-sensitive environments'],
  },
];

// ============================================
// HINGE CATALOG - Grass Tiomos
// ============================================

export const GRASS_TIOMOS_HINGES: HingeSpec[] = [
  {
    id: 'TIOMOS_FULL_110',
    type: 'TIOMOS',
    name: 'Tiomos 110° Full Overlay',
    nameTH: 'ทิโอมอส 110° เต็มบาน',
    brand: 'Grass',
    articleCode: 'F045138465228',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'FULL',
    overlayAdjustment: 18,
    overlayRange: [16, 20],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: false,
    maxDoorWeight: 30,
    maxDoorWidth: 600,
    maxDoorHeight: 2200,
    adjustmentSide: 2.5,
    adjustmentHeight: 3,
    adjustmentDepth: 3,
    bestFor: ['Budget-friendly', 'Standard applications'],
  },
  {
    id: 'TIOMOS_SOFT_FULL_110',
    type: 'TIOMOS_SOFT',
    name: 'Tiomos Soft-close 110° Full Overlay',
    nameTH: 'ทิโอมอส ซอฟท์โคลส 110° เต็มบาน',
    brand: 'Grass',
    articleCode: 'F045138465328',
    cupDiameter: 35,
    cupDepth: 11.5,
    cupCenterToEdge: 21.5,
    overlay: 'FULL',
    overlayAdjustment: 18,
    overlayRange: [16, 20],
    openingAngle: 110,
    plateType: 'CLIP',
    plateHeight: 0,
    plateHoleSpacing: 32,
    plateHoleDiameter: 5,
    hasSoftClose: true,
    softCloseType: 'INTEGRATED',
    maxDoorWeight: 30,
    maxDoorWidth: 600,
    maxDoorHeight: 2200,
    adjustmentSide: 2.5,
    adjustmentHeight: 3,
    adjustmentDepth: 3,
    bestFor: ['Value soft-close', 'Standard applications'],
  },
];

// ============================================
// COMBINED CATALOG
// ============================================

export const HINGE_CATALOG: HingeSpec[] = [
  ...BLUM_CLIP_TOP_HINGES,
  ...BLUM_BLUMOTION_HINGES,
  ...HETTICH_SENSYS_HINGES,
  ...GRASS_TIOMOS_HINGES,
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get hinges by overlay type
 */
export function getHingesByOverlay(overlay: HingeOverlayType): HingeSpec[] {
  return HINGE_CATALOG.filter((h) => h.overlay === overlay);
}

/**
 * Get hinges by opening angle
 */
export function getHingesByOpeningAngle(angle: HingeOpeningAngle): HingeSpec[] {
  return HINGE_CATALOG.filter((h) => h.openingAngle === angle);
}

/**
 * Get hinges by brand
 */
export function getHingesByBrand(brand: 'Blum' | 'Hettich' | 'Grass'): HingeSpec[] {
  return HINGE_CATALOG.filter((h) => h.brand === brand);
}

/**
 * Get hinges with soft-close
 */
export function getSoftCloseHinges(): HingeSpec[] {
  return HINGE_CATALOG.filter((h) => h.hasSoftClose);
}

/**
 * Get hinge by ID
 */
export function getHingeById(id: string): HingeSpec | undefined {
  return HINGE_CATALOG.find((h) => h.id === id);
}

/**
 * Calculate recommended hinge count for door dimensions
 * Based on door height (standard rule: 1 hinge per 500mm + 1)
 */
export function calculateHingeCount(doorHeight: number, doorWeight: number): number {
  // Base calculation: 1 hinge per 500mm of height, minimum 2
  const byHeight = Math.max(2, Math.ceil(doorHeight / 500));

  // Weight consideration: add hinges for heavy doors
  const byWeight = doorWeight > 20 ? Math.ceil(doorWeight / 15) : 2;

  return Math.max(byHeight, byWeight);
}

/**
 * Calculate hinge positions along door height
 * Standard spacing: top/bottom hinges 100mm from edge, rest evenly spaced
 */
export function calculateHingePositions(
  doorHeight: number,
  hingeCount: number,
  topOffset: number = 100,
  bottomOffset: number = 100
): number[] {
  if (hingeCount < 2) return [topOffset];

  const positions: number[] = [];
  const usableHeight = doorHeight - topOffset - bottomOffset;

  for (let i = 0; i < hingeCount; i++) {
    if (i === 0) {
      positions.push(topOffset);
    } else if (i === hingeCount - 1) {
      positions.push(doorHeight - bottomOffset);
    } else {
      const spacing = usableHeight / (hingeCount - 1);
      positions.push(topOffset + spacing * i);
    }
  }

  return positions;
}

/**
 * Validate if hinge is suitable for door specifications
 */
export function validateHingeForDoor(
  hinge: HingeSpec,
  doorWidth: number,
  doorHeight: number,
  doorWeight: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (doorWeight > hinge.maxDoorWeight) {
    warnings.push(`Door weight (${doorWeight}kg) exceeds hinge capacity (${hinge.maxDoorWeight}kg)`);
  }

  if (doorWidth > hinge.maxDoorWidth) {
    warnings.push(`Door width (${doorWidth}mm) exceeds recommended maximum (${hinge.maxDoorWidth}mm)`);
  }

  if (doorHeight > hinge.maxDoorHeight) {
    warnings.push(`Door height (${doorHeight}mm) exceeds recommended maximum (${hinge.maxDoorHeight}mm)`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Generate hinge boring pattern for CNC
 */
export interface HingeBorePattern {
  cupX: number;       // Cup center X from door edge
  cupY: number;       // Cup center Y from door top
  cupDiameter: number;
  cupDepth: number;
  plateHoles: Array<{
    x: number;
    y: number;
    diameter: number;
    depth: number;
  }>;
}

export function generateHingeBorePattern(
  hinge: HingeSpec,
  positionY: number,
  doorThickness: number
): HingeBorePattern {
  return {
    cupX: hinge.cupCenterToEdge,
    cupY: positionY,
    cupDiameter: hinge.cupDiameter,
    cupDepth: hinge.cupDepth,
    plateHoles: [
      {
        x: hinge.cupCenterToEdge - hinge.plateHoleSpacing / 2,
        y: positionY,
        diameter: hinge.plateHoleDiameter,
        depth: doorThickness - 2, // 2mm from back surface
      },
      {
        x: hinge.cupCenterToEdge + hinge.plateHoleSpacing / 2,
        y: positionY,
        diameter: hinge.plateHoleDiameter,
        depth: doorThickness - 2,
      },
    ],
  };
}
