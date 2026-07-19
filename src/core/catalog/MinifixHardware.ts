/**
 * Häfele Minifix Hardware Catalog
 *
 * ARCHITECTURE (North Star v4.0):
 * - Minifix cabinet connector specifications
 * - Connecting bolt variants (C100, S100, S200, S300, M100, M200)
 * - Wood dowel specifications
 * - CNC drilling pattern generation
 *
 * REFERENCE:
 * - Häfele Minifix® catalog documentation
 * - Compatible with 32mm system construction
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⚠️ CRITICAL ARCHITECTURE NOTE: Preset Data Has Two Distinct Uses
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Minifix presets define hardware specifications that serve TWO DOMAINS:
 *
 * 1. ASSEMBLY PREVIEW DOMAIN (O_hardware)
 *    - Visual dimensions for 3D preview (MinifixConfigPanel.tsx)
 *    - Ball head, sleeve, shaft visual representation
 *    - Cam housing in "assembled" rotational state
 *    - Purpose: Designer verification, not manufacturing
 *
 * 2. CNC MANUFACTURING DOMAIN (O_panel)
 *    - Drilling parameters derived from catalog specs
 *    - Cam housing: Ø15mm bore, depth per wood thickness
 *    - Bolt hole: Ø5mm or Ø8mm pilot, depth per bolt length
 *    - See: mapMinifixToOps.ts for actual CNC mapping
 *
 * When adding new presets, ensure both aspects are covered:
 * - assemblySpec: Visual dimensions for preview
 * - cncSpec: Actual drilling diameters and depths for G-code
 *
 * ⚠️ generateMinifixDrillingPattern() creates reference patterns.
 *    Actual CNC ops come from validated packet data (mapMinifixToOps.ts).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { SYSTEM_32_GRID } from './System32';

// ============================================
// MINIFIX HOUSING TYPES
// ============================================

/**
 * Minifix housing size variants
 * - MINIFIX_12: 12mm diameter, for 12mm+ wood thickness
 * - MINIFIX_15: 15mm diameter, for 12-34mm wood thickness
 * - MAXIFIX: 35mm diameter, for heavy-duty applications
 */
export type MinifixHousingType = 'MINIFIX_12' | 'MINIFIX_15' | 'MAXIFIX';

export interface MinifixHousingSpec {
  id: MinifixHousingType;
  name: string;
  nameTH: string;
  hafeleCode: string;

  // Housing dimensions
  diameter: number;           // Housing diameter (mm)
  drillingDepth: number;      // Required drilling depth (mm)
  drillingDepthRange?: [number, number];  // Min/max for adjustable

  // Wood compatibility
  minWoodThickness: number;   // Minimum panel thickness (mm)
  maxWoodThickness: number;   // Maximum panel thickness (mm)

  // Edge distance (dim B in catalog)
  edgeDistance: number;       // Distance from housing center to panel edge (mm)

  // Bolt hole
  boltHoleDiameter: number;   // Diameter of bolt entry hole (mm)

  // Load capacity
  maxPullForce: number;       // Maximum pull-out force (N)
  maxShearForce: number;      // Maximum shear force (N)

  // Compatible bolts
  compatibleBolts: ConnectingBoltType[];
}

export const MINIFIX_HOUSINGS: Record<MinifixHousingType, MinifixHousingSpec> = {
  MINIFIX_12: {
    id: 'MINIFIX_12',
    name: 'Minifix® 12',
    nameTH: 'มินิฟิกซ์ 12',
    hafeleCode: '262.24.xxx',
    diameter: 12,
    drillingDepth: 9.5,
    minWoodThickness: 12,
    maxWoodThickness: 19,
    edgeDistance: 24,  // dim B = 24mm standard
    boltHoleDiameter: 5,
    maxPullForce: 750,
    maxShearForce: 500,
    compatibleBolts: ['C100', 'S100', 'M100'],
  },

  MINIFIX_15: {
    id: 'MINIFIX_15',
    name: 'Minifix® 15',
    nameTH: 'มินิฟิกซ์ 15',
    hafeleCode: '262.26.xxx',
    diameter: 15,
    drillingDepth: 12.5,  // Standard depth
    drillingDepthRange: [9.5, 22.5],  // Adjustable range
    minWoodThickness: 12,
    maxWoodThickness: 34,
    edgeDistance: 34,  // dim B = 34mm standard
    boltHoleDiameter: 8,
    maxPullForce: 1200,
    maxShearForce: 800,
    compatibleBolts: ['C100', 'S100', 'S200', 'S300', 'M100', 'M200'],
  },

  MAXIFIX: {
    id: 'MAXIFIX',
    name: 'Maxifix E',
    nameTH: 'แม็กซิฟิกซ์ E',
    hafeleCode: '262.87.xxx',
    diameter: 35,
    drillingDepth: 12.5,
    minWoodThickness: 16,
    maxWoodThickness: 50,
    edgeDistance: 50,
    boltHoleDiameter: 10,
    maxPullForce: 2500,
    maxShearForce: 1500,
    compatibleBolts: ['M200'],  // Uses special Maxifix bolts
  },
};

// ============================================
// CONNECTING BOLT TYPES
// ============================================

/**
 * Connecting bolt variants
 * - C100: Steel bolt with thread (wood-to-wood)
 * - S100: Single-ended wood screw bolt
 * - S200: Double-ended wood screw bolt
 * - S300: Long wood screw bolt
 * - M100: Metal thread bolt (for metal inserts)
 * - M200: Heavy-duty metal bolt
 */
export type ConnectingBoltType = 'C100' | 'S100' | 'S200' | 'S300' | 'M100' | 'M200';

export interface ConnectingBoltSpec {
  id: ConnectingBoltType;
  name: string;
  nameTH: string;
  hafeleCode: string;

  // Bolt dimensions
  length: number;             // Total length (mm)
  threadDiameter: number;     // Thread outer diameter (mm)
  headDiameter: number;       // Head diameter (mm)

  // Drilling requirements
  pilotHoleDiameter: number;  // Required pilot hole diameter (mm)
  counterboreDiameter?: number;  // Counterbore for head (mm)
  counterboreDepth?: number;  // Counterbore depth (mm)

  // Connection properties
  threadType: 'wood' | 'machine' | 'special';
  requiresInsert: boolean;    // Requires threaded insert
  insertType?: string;        // Type of insert required

  // Load capacity
  pullOutForce: number;       // Pull-out force in wood (N)

  // Application
  bestFor: string[];
}

export const CONNECTING_BOLTS: Record<ConnectingBoltType, ConnectingBoltSpec> = {
  C100: {
    id: 'C100',
    name: 'Connecting Bolt C100',
    nameTH: 'สกรูยึด C100',
    hafeleCode: '262.28.904',
    length: 24,
    threadDiameter: 5,
    headDiameter: 7,
    pilotHoleDiameter: 5,
    threadType: 'special',
    requiresInsert: false,
    pullOutForce: 700,
    bestFor: ['Standard cabinet connections', 'Quick assembly'],
  },

  S100: {
    id: 'S100',
    name: 'Wood Screw Bolt S100',
    nameTH: 'สกรูยึดไม้ S100',
    hafeleCode: '262.28.906',
    length: 24,
    threadDiameter: 6,
    headDiameter: 7,
    pilotHoleDiameter: 4,
    threadType: 'wood',
    requiresInsert: false,
    pullOutForce: 900,
    bestFor: ['Solid wood panels', 'Plywood', 'Direct screw-in'],
  },

  S200: {
    id: 'S200',
    name: 'Wood Screw Bolt S200',
    nameTH: 'สกรูยึดไม้ S200',
    hafeleCode: '262.28.908',
    length: 34,
    threadDiameter: 6,
    headDiameter: 7,
    pilotHoleDiameter: 4,
    threadType: 'wood',
    requiresInsert: false,
    pullOutForce: 1100,
    bestFor: ['Thick panels', 'High-load connections'],
  },

  S300: {
    id: 'S300',
    name: 'Wood Screw Bolt S300',
    nameTH: 'สกรูยึดไม้ S300',
    hafeleCode: '262.28.910',
    length: 44,
    threadDiameter: 6,
    headDiameter: 7,
    pilotHoleDiameter: 4,
    threadType: 'wood',
    requiresInsert: false,
    pullOutForce: 1300,
    bestFor: ['Extra-thick panels (25mm+)', 'Heavy-duty applications'],
  },

  M100: {
    id: 'M100',
    name: 'Machine Thread Bolt M100',
    nameTH: 'สกรูเกลียวมิล M100',
    hafeleCode: '262.28.920',
    length: 24,
    threadDiameter: 6,
    headDiameter: 7,
    pilotHoleDiameter: 8,
    counterboreDiameter: 10,
    counterboreDepth: 9,
    threadType: 'machine',
    requiresInsert: true,
    insertType: 'M6 threaded insert',
    pullOutForce: 1500,  // With proper insert
    bestFor: ['Particle board', 'MDF', 'Reusable connections'],
  },

  M200: {
    id: 'M200',
    name: 'Machine Thread Bolt M200',
    nameTH: 'สกรูเกลียวมิล M200',
    hafeleCode: '262.28.922',
    length: 34,
    threadDiameter: 6,
    headDiameter: 7,
    pilotHoleDiameter: 8,
    counterboreDiameter: 10,
    counterboreDepth: 9,
    threadType: 'machine',
    requiresInsert: true,
    insertType: 'M6 threaded insert',
    pullOutForce: 2000,
    bestFor: ['Knockdown furniture', 'Frequent disassembly', 'Showroom displays'],
  },
};

// ============================================
// WOOD DOWELS
// ============================================

/**
 * Wood dowel types for alignment and strength
 */
export type DowelType = 'FLUTED' | 'GROOVED' | 'PRE_GLUED';

export interface WoodDowelSpec {
  id: string;
  name: string;
  nameTH: string;
  hafeleCode: string;

  // Dimensions
  diameter: number;           // Dowel diameter (mm)
  length: number;             // Dowel length (mm)

  // Dowel characteristics
  type: DowelType;
  material: 'beech' | 'birch' | 'plastic';
  fluted: boolean;            // Has spiral flutes
  preGlued: boolean;          // Has pre-applied glue

  // Drilling requirements
  holeDepth: number;          // Required hole depth per side (mm)
  holeDiameter: number;       // Required hole diameter (mm)
  tolerance: number;          // Hole diameter tolerance (±mm)

  // Best applications
  bestFor: string[];
}

export const WOOD_DOWELS: Record<string, WoodDowelSpec> = {
  // 6mm diameter dowels
  'D6x25': {
    id: 'D6x25',
    name: '6×25mm Fluted Dowel',
    nameTH: 'เดือยไม้ 6×25มม.',
    hafeleCode: '262.00.100',
    diameter: 6,
    length: 25,
    type: 'FLUTED',
    material: 'beech',
    fluted: true,
    preGlued: false,
    holeDepth: 13,
    holeDiameter: 6,
    tolerance: 0.05,
    bestFor: ['Thin panels (12mm)', 'Light connections'],
  },

  'D6x30': {
    id: 'D6x30',
    name: '6×30mm Fluted Dowel',
    nameTH: 'เดือยไม้ 6×30มม.',
    hafeleCode: '262.00.102',
    diameter: 6,
    length: 30,
    type: 'FLUTED',
    material: 'beech',
    fluted: true,
    preGlued: false,
    holeDepth: 15,
    holeDiameter: 6,
    tolerance: 0.05,
    bestFor: ['Standard panels (15-18mm)', 'Shelf supports'],
  },

  // 8mm diameter dowels (most common)
  'D8x30': {
    id: 'D8x30',
    name: '8×30mm Fluted Dowel',
    nameTH: 'เดือยไม้ 8×30มม.',
    hafeleCode: '262.00.110',
    diameter: 8,
    length: 30,
    type: 'FLUTED',
    material: 'beech',
    fluted: true,
    preGlued: false,
    holeDepth: 15,
    holeDiameter: 8,
    tolerance: 0.05,
    bestFor: ['Standard cabinet construction', 'Panel alignment'],
  },

  'D8x32': {
    id: 'D8x32',
    name: '8×32mm Pre-glued Dowel',
    nameTH: 'เดือยไม้เคลือบกาว 8×32มม.',
    hafeleCode: '262.00.112',
    diameter: 8,
    length: 32,
    type: 'PRE_GLUED',
    material: 'beech',
    fluted: true,
    preGlued: true,
    holeDepth: 16,
    holeDiameter: 8,
    tolerance: 0.05,
    bestFor: ['Production line assembly', 'Water-activated glue'],
  },

  'D8x35': {
    id: 'D8x35',
    name: '8×35mm Fluted Dowel',
    nameTH: 'เดือยไม้ 8×35มม.',
    hafeleCode: '262.00.114',
    diameter: 8,
    length: 35,
    type: 'FLUTED',
    material: 'beech',
    fluted: true,
    preGlued: false,
    holeDepth: 17,
    holeDiameter: 8,
    tolerance: 0.05,
    bestFor: ['Thick panels (18mm+)', 'Strong joints'],
  },

  'D8x40': {
    id: 'D8x40',
    name: '8×40mm Fluted Dowel',
    nameTH: 'เดือยไม้ 8×40มม.',
    hafeleCode: '262.00.116',
    diameter: 8,
    length: 40,
    type: 'FLUTED',
    material: 'beech',
    fluted: true,
    preGlued: false,
    holeDepth: 20,
    holeDiameter: 8,
    tolerance: 0.05,
    bestFor: ['Heavy-duty connections', 'Wide panels'],
  },

  // 10mm diameter dowels
  'D10x40': {
    id: 'D10x40',
    name: '10×40mm Fluted Dowel',
    nameTH: 'เดือยไม้ 10×40มม.',
    hafeleCode: '262.00.120',
    diameter: 10,
    length: 40,
    type: 'FLUTED',
    material: 'beech',
    fluted: true,
    preGlued: false,
    holeDepth: 20,
    holeDiameter: 10,
    tolerance: 0.05,
    bestFor: ['High-load joints', 'Solid wood construction'],
  },

  'D10x50': {
    id: 'D10x50',
    name: '10×50mm Fluted Dowel',
    nameTH: 'เดือยไม้ 10×50มม.',
    hafeleCode: '262.00.122',
    diameter: 10,
    length: 50,
    type: 'FLUTED',
    material: 'beech',
    fluted: true,
    preGlued: false,
    holeDepth: 25,
    holeDiameter: 10,
    tolerance: 0.05,
    bestFor: ['Extra-thick panels (25mm+)', 'Maximum strength'],
  },
};

// ============================================
// DRILLING PATTERN TYPES
// ============================================

export interface DrillHole {
  x: number;                  // X position from reference point (mm)
  y: number;                  // Y position from reference point (mm)
  diameter: number;           // Hole diameter (mm)
  depth: number;              // Hole depth (mm)
  type: 'through' | 'blind';  // Through hole or blind hole
  purpose: 'housing' | 'bolt' | 'dowel' | 'insert';
  label?: string;             // Optional label for CNC
}

export interface DrillingPattern {
  id: string;
  name: string;
  description: string;

  // Reference point
  referenceCorner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';

  // Holes
  holes: DrillHole[];

  // Required tools
  requiredDrillBits: number[];  // Required drill bit diameters (mm)

  // Compatible hardware
  housingType: MinifixHousingType;
  boltType: ConnectingBoltType;
  dowelIds?: string[];  // Optional dowels
}

// ============================================
// DRILLING PATTERN GENERATORS
// ============================================

/**
 * Calculate drilling pattern for Minifix connection between two panels
 *
 * Panel A: Contains the Minifix housing (horizontal panel - shelf/top/bottom)
 * Panel B: Contains the bolt (vertical panel - side)
 *
 * @param panelAThickness - Thickness of panel with housing (mm)
 * @param panelBThickness - Thickness of panel with bolt (mm)
 * @param housingType - Minifix housing size
 * @param boltType - Connecting bolt type
 * @param includeDowels - Include alignment dowels
 * @param dowelId - Specific dowel type (defaults to D8x30)
 * @param edgeOffset - Distance from panel edge (mm, defaults to housing spec)
 */
export function generateMinifixDrillingPattern(
  panelAThickness: number,
  panelBThickness: number,
  housingType: MinifixHousingType,
  boltType: ConnectingBoltType,
  includeDowels: boolean = true,
  dowelId: string = 'D8x30',
  edgeOffset?: number
): {
  panelA: DrillingPattern;  // Housing panel
  panelB: DrillingPattern;  // Bolt panel
  warnings: string[];
} {
  const housing = MINIFIX_HOUSINGS[housingType];
  const bolt = CONNECTING_BOLTS[boltType];
  const dowel = WOOD_DOWELS[dowelId];

  const warnings: string[] = [];

  // Validate compatibility
  if (!housing.compatibleBolts.includes(boltType)) {
    warnings.push(`Bolt ${boltType} may not be compatible with ${housingType}`);
  }

  if (panelAThickness < housing.minWoodThickness) {
    warnings.push(`Panel A (${panelAThickness}mm) is thinner than minimum (${housing.minWoodThickness}mm) for ${housingType}`);
  }

  if (panelAThickness > housing.maxWoodThickness) {
    warnings.push(`Panel A (${panelAThickness}mm) is thicker than maximum (${housing.maxWoodThickness}mm) for ${housingType}`);
  }

  const effectiveEdgeOffset = edgeOffset ?? housing.edgeDistance;

  // Panel A: Housing panel (e.g., shelf - holes on face)
  const panelAHoles: DrillHole[] = [
    {
      x: effectiveEdgeOffset,
      y: panelAThickness / 2,
      diameter: housing.diameter,
      depth: housing.drillingDepth,
      type: 'blind',
      purpose: 'housing',
      label: `${housingType} Housing Ø${housing.diameter}`,
    },
  ];

  // Add dowels if requested
  if (includeDowels && dowel) {
    // Dowels typically placed 32mm (or 64mm) from Minifix on each side
    const dowelOffset = 32;  // 32mm system standard

    panelAHoles.push({
      x: effectiveEdgeOffset - dowelOffset,
      y: panelAThickness / 2,
      diameter: dowel.holeDiameter,
      depth: dowel.holeDepth,
      type: 'blind',
      purpose: 'dowel',
      label: `Dowel Ø${dowel.diameter}`,
    });

    panelAHoles.push({
      x: effectiveEdgeOffset + dowelOffset,
      y: panelAThickness / 2,
      diameter: dowel.holeDiameter,
      depth: dowel.holeDepth,
      type: 'blind',
      purpose: 'dowel',
      label: `Dowel Ø${dowel.diameter}`,
    });
  }

  // Panel B: Bolt panel (e.g., side - holes on edge)
  const panelBHoles: DrillHole[] = [
    {
      x: effectiveEdgeOffset,
      y: 0,  // Edge
      diameter: bolt.pilotHoleDiameter,
      depth: bolt.length + 5,  // Bolt length + clearance
      type: 'blind',
      purpose: 'bolt',
      label: `${boltType} Pilot Ø${bolt.pilotHoleDiameter}`,
    },
  ];

  // Add counterbore if required
  if (bolt.counterboreDiameter && bolt.counterboreDepth) {
    // Counterbore is done before pilot hole at same position
    panelBHoles.unshift({
      x: effectiveEdgeOffset,
      y: 0,
      diameter: bolt.counterboreDiameter,
      depth: bolt.counterboreDepth,
      type: 'blind',
      purpose: 'insert',
      label: `Counterbore Ø${bolt.counterboreDiameter}`,
    });
  }

  // Add dowels on panel B edge
  if (includeDowels && dowel) {
    const dowelOffset = 32;

    panelBHoles.push({
      x: effectiveEdgeOffset - dowelOffset,
      y: 0,
      diameter: dowel.holeDiameter,
      depth: dowel.holeDepth,
      type: 'blind',
      purpose: 'dowel',
      label: `Dowel Ø${dowel.diameter}`,
    });

    panelBHoles.push({
      x: effectiveEdgeOffset + dowelOffset,
      y: 0,
      diameter: dowel.holeDiameter,
      depth: dowel.holeDepth,
      type: 'blind',
      purpose: 'dowel',
      label: `Dowel Ø${dowel.diameter}`,
    });
  }

  // Collect required drill bits
  const allHoles = [...panelAHoles, ...panelBHoles];
  const requiredDrillBits = Array.from(new Set(allHoles.map(h => h.diameter))).sort((a, b) => a - b);

  return {
    panelA: {
      id: `minifix-housing-${housingType}`,
      name: `${housing.name} Housing Pattern`,
      description: `Drilling pattern for ${housing.name} housing on face`,
      referenceCorner: 'bottom-left',
      holes: panelAHoles,
      requiredDrillBits,
      housingType,
      boltType,
      dowelIds: includeDowels ? [dowelId] : undefined,
    },
    panelB: {
      id: `minifix-bolt-${boltType}`,
      name: `${bolt.name} Pattern`,
      description: `Drilling pattern for ${bolt.name} on edge`,
      referenceCorner: 'bottom-left',
      holes: panelBHoles,
      requiredDrillBits,
      housingType,
      boltType,
      dowelIds: includeDowels ? [dowelId] : undefined,
    },
    warnings,
  };
}

/**
 * Generate multiple Minifix connections along a panel edge
 *
 * FACTORY STANDARD (Häfele + System 32):
 * - First hole: 37mm from front edge (System 32 standard)
 * - Last hole: 37mm from back edge
 * - Drilling Distance B: 34mm (Häfele catalog spec for MINIFIX_15)
 *
 * @param panelLength - Length of the panel edge (mm)
 * @param panelAThickness - Thickness of panel with housing
 * @param panelBThickness - Thickness of panel with bolt
 * @param housingType - Minifix housing size
 * @param boltType - Connecting bolt type
 * @param spacing - Spacing between Minifix points (mm), default 256mm (32mm × 8)
 * @param includeDowels - Include alignment dowels
 */
export function generateMinifixArrayPattern(
  panelLength: number,
  panelAThickness: number,
  panelBThickness: number,
  housingType: MinifixHousingType,
  boltType: ConnectingBoltType,
  spacing: number = 256,  // 32mm × 8
  includeDowels: boolean = true,
  overrides?: {
    firstHoleZ?: number;         // Override System 32 first hole distance (default 37mm)
    drillingDistanceB?: number;  // Override Häfele drilling distance B (default from housing)
  }
): {
  count: number;
  positions: number[];
  drillingDistanceB: number;  // Häfele catalog "Drilling Distance B"
  firstHoleDistance: number;  // System 32: First hole from front/back edge
  panelA: DrillingPattern;
  panelB: DrillingPattern;
  warnings: string[];
} {
  const housing = MINIFIX_HOUSINGS[housingType];

  // DRILLING DISTANCE B from Häfele catalog (dim A/B in spec):
  // - Minifix 12: B = 24mm
  // - Minifix 15: B = 34mm
  // This is the edge setback for CAM positioning on perpendicular panel
  // Can be overridden by user for custom configurations
  const drillingDistanceB = overrides?.drillingDistanceB ?? housing.edgeDistance;

  // SYSTEM 32: first hole one front-setback in from the front/back edges.
  // SINGLE SOURCE OF TRUTH — the setback comes from SYSTEM_32_GRID in
  // ./System32.ts, not from a local literal. A previously local constant here
  // agreed with the other three declaration sites only by coincidence, and the
  // comment above it still claimed 50mm while the code used 37mm.
  // Can be overridden by user for custom configurations.
  const firstHoleDistance = overrides?.firstHoleZ ?? SYSTEM_32_GRID.frontSetback;

  // Calculate number of Minifix points
  // First and last holes sit one System 32 front-setback in from the panel edges
  const usableLength = panelLength - (2 * firstHoleDistance);
  const count = Math.max(2, Math.floor(usableLength / spacing) + 1);

  // Calculate even spacing between first and last holes
  const actualSpacing = count > 1 ? usableLength / (count - 1) : 0;
  const positions: number[] = [];
  for (let i = 0; i < count; i++) {
    // Positions from front edge: setback, setback+spacing, ... (panelLength - setback)
    positions.push(firstHoleDistance + (i * actualSpacing));
  }

  // Generate single pattern as template
  const singlePattern = generateMinifixDrillingPattern(
    panelAThickness,
    panelBThickness,
    housingType,
    boltType,
    includeDowels
  );

  // Expand holes array for all positions
  const panelAHoles: DrillHole[] = [];
  const panelBHoles: DrillHole[] = [];

  for (const pos of positions) {
    // Offset each hole pattern to the position
    for (const hole of singlePattern.panelA.holes) {
      panelAHoles.push({
        ...hole,
        x: pos + (hole.x - housing.edgeDistance),  // Adjust X relative to position
      });
    }

    for (const hole of singlePattern.panelB.holes) {
      panelBHoles.push({
        ...hole,
        x: pos + (hole.x - housing.edgeDistance),
      });
    }
  }

  const warnings = [...singlePattern.warnings];
  if (actualSpacing > 400) {
    warnings.push(`Spacing ${Math.round(actualSpacing)}mm exceeds recommended maximum 400mm`);
  }

  return {
    count,
    positions,
    drillingDistanceB,  // Häfele "Drilling Distance B" (34mm for MINIFIX_15)
    firstHoleDistance,  // System 32 standard: 37mm from front/back edge
    panelA: {
      ...singlePattern.panelA,
      id: `minifix-array-housing-${housingType}-${count}`,
      name: `${count}× ${housing.name} Housing Pattern`,
      description: `${count} Minifix connections at first=${firstHoleDistance}mm (System 32), B=${drillingDistanceB}mm, spaced ${Math.round(actualSpacing)}mm apart`,
      holes: panelAHoles,
    },
    panelB: {
      ...singlePattern.panelB,
      id: `minifix-array-bolt-${boltType}-${count}`,
      name: `${count}× ${singlePattern.panelB.name}`,
      holes: panelBHoles,
    },
    warnings,
  };
}

// ============================================
// SELECTION HELPERS
// ============================================

/**
 * Get recommended Minifix configuration for given panel thickness
 */
export function getRecommendedMinifixConfig(
  panelThickness: number,
  connectionType: 'standard' | 'heavy-duty' | 'knockdown' = 'standard'
): {
  housing: MinifixHousingType;
  bolt: ConnectingBoltType;
  dowel: string;
  reasoning: string;
} {
  // Thin panels (12-15mm)
  if (panelThickness <= 15) {
    return {
      housing: 'MINIFIX_12',
      bolt: connectionType === 'knockdown' ? 'M100' : 'S100',
      dowel: 'D6x30',
      reasoning: `Thin panel (${panelThickness}mm): Minifix 12 with compact profile`,
    };
  }

  // Standard panels (16-19mm)
  if (panelThickness <= 19) {
    const bolt: ConnectingBoltType =
      connectionType === 'heavy-duty' ? 'S200' :
      connectionType === 'knockdown' ? 'M100' : 'S100';

    return {
      housing: 'MINIFIX_15',
      bolt,
      dowel: 'D8x30',
      reasoning: `Standard panel (${panelThickness}mm): Minifix 15 for optimal strength`,
    };
  }

  // Thick panels (20-34mm)
  if (panelThickness <= 34) {
    const bolt: ConnectingBoltType =
      connectionType === 'heavy-duty' ? 'S300' :
      connectionType === 'knockdown' ? 'M200' : 'S200';

    return {
      housing: 'MINIFIX_15',
      bolt,
      dowel: 'D8x35',
      reasoning: `Thick panel (${panelThickness}mm): Minifix 15 with longer bolt`,
    };
  }

  // Extra thick panels (35mm+)
  return {
    housing: 'MAXIFIX',
    bolt: 'M200',
    dowel: 'D10x40',
    reasoning: `Extra-thick panel (${panelThickness}mm): Maxifix for maximum strength`,
  };
}

/**
 * Validate if Minifix configuration is suitable for given load
 */
export function validateMinifixLoad(
  housingType: MinifixHousingType,
  boltType: ConnectingBoltType,
  connectionCount: number,
  expectedPullLoad: number,  // N
  expectedShearLoad: number  // N
): {
  valid: boolean;
  pullCapacity: number;
  shearCapacity: number;
  pullUtilization: number;    // %
  shearUtilization: number;   // %
  warnings: string[];
} {
  const housing = MINIFIX_HOUSINGS[housingType];
  const bolt = CONNECTING_BOLTS[boltType];

  const pullCapacity = Math.min(housing.maxPullForce, bolt.pullOutForce) * connectionCount;
  const shearCapacity = housing.maxShearForce * connectionCount;

  const pullUtilization = (expectedPullLoad / pullCapacity) * 100;
  const shearUtilization = (expectedShearLoad / shearCapacity) * 100;

  const warnings: string[] = [];

  if (pullUtilization > 80) {
    warnings.push(`Pull load at ${Math.round(pullUtilization)}% capacity - consider adding connections`);
  }
  if (shearUtilization > 80) {
    warnings.push(`Shear load at ${Math.round(shearUtilization)}% capacity - consider adding connections`);
  }
  if (pullUtilization > 50 || shearUtilization > 50) {
    warnings.push('Consider using construction adhesive for additional strength');
  }

  return {
    valid: pullUtilization <= 100 && shearUtilization <= 100,
    pullCapacity,
    shearCapacity,
    pullUtilization: Math.round(pullUtilization * 10) / 10,
    shearUtilization: Math.round(shearUtilization * 10) / 10,
    warnings,
  };
}

/**
 * Get all compatible hardware for a given housing type
 */
export function getCompatibleHardware(housingType: MinifixHousingType): {
  housing: MinifixHousingSpec;
  bolts: ConnectingBoltSpec[];
  recommendedDowels: WoodDowelSpec[];
} {
  const housing = MINIFIX_HOUSINGS[housingType];
  const bolts = housing.compatibleBolts.map(id => CONNECTING_BOLTS[id]);

  // Recommend dowels based on housing size
  const recommendedDowelIds =
    housingType === 'MINIFIX_12' ? ['D6x25', 'D6x30', 'D8x30'] :
    housingType === 'MINIFIX_15' ? ['D8x30', 'D8x32', 'D8x35'] :
    ['D8x40', 'D10x40', 'D10x50'];

  const recommendedDowels = recommendedDowelIds.map(id => WOOD_DOWELS[id]);

  return {
    housing,
    bolts,
    recommendedDowels,
  };
}

// ============================================
// DXF EXPORT HELPERS
// ============================================

/**
 * Convert drilling pattern to DXF-ready coordinates
 *
 * @param pattern - Drilling pattern
 * @param panelWidth - Panel width (mm)
 * @param panelHeight - Panel height (mm)
 * @param mirror - Mirror pattern for opposite side
 */
export function patternToDxfCoordinates(
  pattern: DrillingPattern,
  panelWidth: number,
  panelHeight: number,
  mirror: boolean = false
): Array<{
  x: number;
  y: number;
  diameter: number;
  depth: number;
  label: string;
}> {
  return pattern.holes.map(hole => {
    const x = mirror ? panelWidth - hole.x : hole.x;
    const y = hole.y;

    return {
      x,
      y,
      diameter: hole.diameter,
      depth: hole.depth,
      label: hole.label || `Ø${hole.diameter}×${hole.depth}`,
    };
  });
}

/**
 * Generate drilling summary for CNC operator
 */
export function generateDrillingSummary(pattern: DrillingPattern): string {
  const lines: string[] = [
    `=== ${pattern.name} ===`,
    pattern.description,
    '',
    'Required Drill Bits:',
  ];

  for (const diameter of pattern.requiredDrillBits) {
    lines.push(`  - Ø${diameter}mm`);
  }

  lines.push('', 'Drilling Operations:');

  for (const hole of pattern.holes) {
    lines.push(`  ${hole.label}: X=${hole.x}mm, Y=${hole.y}mm, Depth=${hole.depth}mm`);
  }

  return lines.join('\n');
}
