/**
 * Dowel Hardware Catalog
 *
 * Wood dowel specifications for cabinet assembly and alignment.
 * Covers standard beech dowels, pre-glued dowels, and plastic dowels.
 *
 * NOTE: This catalog focuses on general-purpose dowels for panel joints.
 * For Minifix-specific assembly dowels, see MinifixHardware.ts
 *
 * @version 1.0.0
 */

// ============================================
// DOWEL TYPES
// ============================================

/**
 * Dowel size notation (diameter x length in mm)
 */
export type DowelSize =
  | '5x20'
  | '5x25'
  | '6x25'
  | '6x30'
  | '6x35'
  | '8x30'
  | '8x32'
  | '8x35'
  | '8x40'
  | '10x40'
  | '10x50'
  | '12x50'
  | '12x60';

/**
 * Dowel surface types
 */
export type DowelSurfaceType =
  | 'FLUTED'       // Spiral flutes for glue distribution
  | 'GROOVED'      // Straight grooves
  | 'SMOOTH'       // Plain surface
  | 'RIBBED';      // Cross-ribbed pattern

/**
 * Dowel materials
 */
export type DowelMaterial =
  | 'BEECH'        // European beech (most common)
  | 'BIRCH'        // Birch wood
  | 'HARDWOOD'     // Mixed hardwood
  | 'PLASTIC';     // Nylon/plastic

// ============================================
// DOWEL SPECIFICATIONS
// ============================================

export interface DowelSpec {
  id: string;
  size: DowelSize;
  name: string;
  nameTH: string;

  // Dimensions
  diameter: number;         // Dowel diameter (mm)
  length: number;           // Dowel length (mm)

  // Surface characteristics
  surfaceType: DowelSurfaceType;
  material: DowelMaterial;
  preGlued: boolean;        // Has pre-applied glue (water-activated)

  // Drilling requirements
  holeDiameter: number;     // Required hole diameter (mm)
  holeDepthPerSide: number; // Depth per panel side (mm)
  holeTolerance: number;    // Diameter tolerance (±mm)

  // Load capacity
  shearStrength: number;    // Approximate shear strength (N)
  pullOutStrength: number;  // Pull-out force (N)

  // Application
  minPanelThickness: number; // Minimum panel thickness (mm)
  maxPanelThickness: number; // Maximum for balanced joint (mm)

  // Catalog reference
  hafeleCode?: string;

  bestFor: string[];
}

// ============================================
// DOWEL CATALOG - Small Diameter (5-6mm)
// ============================================

export const SMALL_DOWELS: DowelSpec[] = [
  {
    id: 'D5x20',
    size: '5x20',
    name: '5×20mm Fluted Dowel',
    nameTH: 'เดือยไม้ 5×20มม.',
    diameter: 5,
    length: 20,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 5,
    holeDepthPerSide: 10,
    holeTolerance: 0.05,
    shearStrength: 400,
    pullOutStrength: 300,
    minPanelThickness: 10,
    maxPanelThickness: 15,
    hafeleCode: '262.00.090',
    bestFor: ['Thin panels', 'Light duty', 'Alignment only'],
  },
  {
    id: 'D5x25',
    size: '5x25',
    name: '5×25mm Fluted Dowel',
    nameTH: 'เดือยไม้ 5×25มม.',
    diameter: 5,
    length: 25,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 5,
    holeDepthPerSide: 12,
    holeTolerance: 0.05,
    shearStrength: 450,
    pullOutStrength: 350,
    minPanelThickness: 12,
    maxPanelThickness: 16,
    hafeleCode: '262.00.092',
    bestFor: ['Thin panels', 'Small components', 'Drawer parts'],
  },
  {
    id: 'D6x25',
    size: '6x25',
    name: '6×25mm Fluted Dowel',
    nameTH: 'เดือยไม้ 6×25มม.',
    diameter: 6,
    length: 25,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 6,
    holeDepthPerSide: 12,
    holeTolerance: 0.05,
    shearStrength: 550,
    pullOutStrength: 450,
    minPanelThickness: 12,
    maxPanelThickness: 18,
    hafeleCode: '262.00.100',
    bestFor: ['12mm panels', 'Light connections', 'Backing panels'],
  },
  {
    id: 'D6x30',
    size: '6x30',
    name: '6×30mm Fluted Dowel',
    nameTH: 'เดือยไม้ 6×30มม.',
    diameter: 6,
    length: 30,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 6,
    holeDepthPerSide: 15,
    holeTolerance: 0.05,
    shearStrength: 600,
    pullOutStrength: 500,
    minPanelThickness: 15,
    maxPanelThickness: 19,
    hafeleCode: '262.00.102',
    bestFor: ['Standard panels', '15-18mm thickness', 'General purpose'],
  },
  {
    id: 'D6x35',
    size: '6x35',
    name: '6×35mm Fluted Dowel',
    nameTH: 'เดือยไม้ 6×35มม.',
    diameter: 6,
    length: 35,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 6,
    holeDepthPerSide: 17,
    holeTolerance: 0.05,
    shearStrength: 650,
    pullOutStrength: 550,
    minPanelThickness: 18,
    maxPanelThickness: 22,
    hafeleCode: '262.00.104',
    bestFor: ['18mm panels', 'Medium loads', 'Cabinet joints'],
  },
];

// ============================================
// DOWEL CATALOG - Standard Diameter (8mm)
// ============================================

export const STANDARD_DOWELS: DowelSpec[] = [
  {
    id: 'D8x30',
    size: '8x30',
    name: '8×30mm Fluted Dowel',
    nameTH: 'เดือยไม้ 8×30มม.',
    diameter: 8,
    length: 30,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 8,
    holeDepthPerSide: 15,
    holeTolerance: 0.05,
    shearStrength: 800,
    pullOutStrength: 650,
    minPanelThickness: 15,
    maxPanelThickness: 20,
    hafeleCode: '262.00.110',
    bestFor: ['Most common size', 'Standard cabinet construction', 'Reliable joints'],
  },
  {
    id: 'D8x32',
    size: '8x32',
    name: '8×32mm Pre-glued Dowel',
    nameTH: 'เดือยไม้เคลือบกาว 8×32มม.',
    diameter: 8,
    length: 32,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: true,
    holeDiameter: 8,
    holeDepthPerSide: 16,
    holeTolerance: 0.05,
    shearStrength: 850,
    pullOutStrength: 700,
    minPanelThickness: 16,
    maxPanelThickness: 22,
    hafeleCode: '262.00.112',
    bestFor: ['Production line', 'Water-activated glue', 'Fast assembly'],
  },
  {
    id: 'D8x35',
    size: '8x35',
    name: '8×35mm Fluted Dowel',
    nameTH: 'เดือยไม้ 8×35มม.',
    diameter: 8,
    length: 35,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 8,
    holeDepthPerSide: 17,
    holeTolerance: 0.05,
    shearStrength: 900,
    pullOutStrength: 750,
    minPanelThickness: 18,
    maxPanelThickness: 25,
    hafeleCode: '262.00.114',
    bestFor: ['18mm panels', 'Strong joints', 'Furniture grade'],
  },
  {
    id: 'D8x40',
    size: '8x40',
    name: '8×40mm Fluted Dowel',
    nameTH: 'เดือยไม้ 8×40มม.',
    diameter: 8,
    length: 40,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 8,
    holeDepthPerSide: 20,
    holeTolerance: 0.05,
    shearStrength: 950,
    pullOutStrength: 800,
    minPanelThickness: 20,
    maxPanelThickness: 30,
    hafeleCode: '262.00.116',
    bestFor: ['Thick panels', 'Heavy-duty connections', 'Wide panels'],
  },
];

// ============================================
// DOWEL CATALOG - Large Diameter (10-12mm)
// ============================================

export const LARGE_DOWELS: DowelSpec[] = [
  {
    id: 'D10x40',
    size: '10x40',
    name: '10×40mm Fluted Dowel',
    nameTH: 'เดือยไม้ 10×40มม.',
    diameter: 10,
    length: 40,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 10,
    holeDepthPerSide: 20,
    holeTolerance: 0.05,
    shearStrength: 1200,
    pullOutStrength: 1000,
    minPanelThickness: 20,
    maxPanelThickness: 35,
    hafeleCode: '262.00.120',
    bestFor: ['High-load joints', 'Solid wood', 'Table legs'],
  },
  {
    id: 'D10x50',
    size: '10x50',
    name: '10×50mm Fluted Dowel',
    nameTH: 'เดือยไม้ 10×50มม.',
    diameter: 10,
    length: 50,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 10,
    holeDepthPerSide: 25,
    holeTolerance: 0.05,
    shearStrength: 1350,
    pullOutStrength: 1150,
    minPanelThickness: 25,
    maxPanelThickness: 40,
    hafeleCode: '262.00.122',
    bestFor: ['Maximum strength', 'Extra-thick panels', 'Structural joints'],
  },
  {
    id: 'D12x50',
    size: '12x50',
    name: '12×50mm Fluted Dowel',
    nameTH: 'เดือยไม้ 12×50มม.',
    diameter: 12,
    length: 50,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 12,
    holeDepthPerSide: 25,
    holeTolerance: 0.05,
    shearStrength: 1600,
    pullOutStrength: 1400,
    minPanelThickness: 25,
    maxPanelThickness: 45,
    hafeleCode: '262.00.130',
    bestFor: ['Heavy furniture', 'Workbenches', 'Industrial applications'],
  },
  {
    id: 'D12x60',
    size: '12x60',
    name: '12×60mm Fluted Dowel',
    nameTH: 'เดือยไม้ 12×60มม.',
    diameter: 12,
    length: 60,
    surfaceType: 'FLUTED',
    material: 'BEECH',
    preGlued: false,
    holeDiameter: 12,
    holeDepthPerSide: 30,
    holeTolerance: 0.05,
    shearStrength: 1800,
    pullOutStrength: 1600,
    minPanelThickness: 30,
    maxPanelThickness: 50,
    hafeleCode: '262.00.132',
    bestFor: ['Maximum length', 'Solid wood construction', 'Timber framing'],
  },
];

// ============================================
// COMBINED CATALOG
// ============================================

export const DOWEL_CATALOG: DowelSpec[] = [
  ...SMALL_DOWELS,
  ...STANDARD_DOWELS,
  ...LARGE_DOWELS,
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get dowel by size notation
 */
export function getDowelBySize(size: DowelSize): DowelSpec | undefined {
  return DOWEL_CATALOG.find((d) => d.size === size);
}

/**
 * Get dowel by ID
 */
export function getDowelById(id: string): DowelSpec | undefined {
  return DOWEL_CATALOG.find((d) => d.id === id);
}

/**
 * Get dowels by diameter
 */
export function getDowelsByDiameter(diameter: number): DowelSpec[] {
  return DOWEL_CATALOG.filter((d) => d.diameter === diameter);
}

/**
 * Get pre-glued dowels only
 */
export function getPreGluedDowels(): DowelSpec[] {
  return DOWEL_CATALOG.filter((d) => d.preGlued);
}

/**
 * Get recommended dowel for panel thickness
 */
export function getRecommendedDowel(panelThickness: number): DowelSpec {
  // Find dowel where panel thickness is within range
  const suitable = DOWEL_CATALOG.filter(
    (d) => panelThickness >= d.minPanelThickness && panelThickness <= d.maxPanelThickness
  );

  if (suitable.length === 0) {
    // Default to 8x30 if no exact match
    return DOWEL_CATALOG.find((d) => d.id === 'D8x30')!;
  }

  // Prefer 8mm diameter as standard
  const preferred = suitable.find((d) => d.diameter === 8);
  return preferred || suitable[0];
}

/**
 * Calculate number of dowels needed for a joint
 */
export function calculateDowelCount(
  jointLength: number,
  spacing: number = 100,  // 100mm typical spacing
  minDowels: number = 2
): number {
  const count = Math.ceil(jointLength / spacing);
  return Math.max(minDowels, count);
}

/**
 * Calculate dowel positions along a joint
 */
export function calculateDowelPositions(
  jointLength: number,
  dowelCount: number,
  edgeOffset: number = 50  // 50mm from edge
): number[] {
  if (dowelCount < 2) return [jointLength / 2];

  const positions: number[] = [];
  const usableLength = jointLength - 2 * edgeOffset;
  const spacing = usableLength / (dowelCount - 1);

  for (let i = 0; i < dowelCount; i++) {
    positions.push(edgeOffset + i * spacing);
  }

  return positions;
}

/**
 * Validate dowel configuration for joint
 */
export function validateDowelConfig(
  dowel: DowelSpec,
  panelThickness: number,
  jointType: 'EDGE_TO_FACE' | 'EDGE_TO_EDGE' | 'FACE_TO_FACE'
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (panelThickness < dowel.minPanelThickness) {
    warnings.push(`Panel thickness (${panelThickness}mm) is less than minimum (${dowel.minPanelThickness}mm)`);
  }

  if (panelThickness > dowel.maxPanelThickness) {
    warnings.push(`Panel thickness (${panelThickness}mm) exceeds recommended maximum (${dowel.maxPanelThickness}mm)`);
  }

  // Edge-to-face requires hole depth consideration
  if (jointType === 'EDGE_TO_FACE') {
    if (dowel.holeDepthPerSide > panelThickness * 0.6) {
      warnings.push('Hole depth may be too deep for panel thickness in edge joint');
    }
  }

  // Diameter should not exceed 1/2 panel thickness for edge joints
  if (jointType !== 'FACE_TO_FACE' && dowel.diameter > panelThickness / 2) {
    warnings.push(`Dowel diameter (${dowel.diameter}mm) exceeds half panel thickness`);
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Generate dowel drilling pattern
 */
export interface DowelDrillingPattern {
  panelId: string;
  jointSide: 'FACE' | 'EDGE';
  holes: Array<{
    x: number;        // Position along joint
    y: number;        // Offset from edge (for face) or 0 (for edge)
    diameter: number;
    depth: number;
  }>;
}

export function generateDowelDrillingPattern(
  jointLength: number,
  dowel: DowelSpec,
  dowelCount: number,
  edgeDistance: number = 30,  // Distance from panel edge to dowel center
  jointSide: 'FACE' | 'EDGE' = 'FACE'
): DowelDrillingPattern {
  const positions = calculateDowelPositions(jointLength, dowelCount);

  return {
    panelId: 'PANEL',
    jointSide,
    holes: positions.map((x) => ({
      x,
      y: jointSide === 'FACE' ? edgeDistance : 0,
      diameter: dowel.holeDiameter,
      depth: dowel.holeDepthPerSide,
    })),
  };
}

/**
 * Get dowel strength summary
 */
export function getDowelStrengthSummary(
  dowel: DowelSpec,
  dowelCount: number
): {
  totalShearStrength: number;
  totalPullOutStrength: number;
  safeWorkingLoad: number;  // With safety factor
} {
  const safetyFactor = 2.5;  // Standard safety factor

  return {
    totalShearStrength: dowel.shearStrength * dowelCount,
    totalPullOutStrength: dowel.pullOutStrength * dowelCount,
    safeWorkingLoad: Math.min(
      dowel.shearStrength * dowelCount,
      dowel.pullOutStrength * dowelCount
    ) / safetyFactor,
  };
}
