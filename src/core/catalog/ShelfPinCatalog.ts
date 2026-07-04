/**
 * Shelf Pin Hardware Catalog
 *
 * Shelf pin/support specifications for adjustable shelving systems.
 * Primarily supports System 32 (32mm spacing) standard.
 *
 * SYSTEM 32 NOTE:
 * The 32mm system is the industry standard for cabinet hardware positioning.
 * Shelf pin holes are drilled in vertical rows with 32mm spacing.
 * This allows shelves to be adjusted in 32mm increments.
 *
 * @version 1.0.0
 */

// ============================================
// SHELF PIN TYPES
// ============================================

/**
 * Shelf pin system types
 */
export type ShelfPinSystem =
  | 'SYSTEM_32'     // Standard 32mm spacing
  | 'SYSTEM_25'     // 25mm spacing (less common)
  | 'CUSTOM';       // Custom spacing

/**
 * Shelf pin styles
 */
export type ShelfPinStyle =
  | 'STANDARD'      // Simple cylindrical pin
  | 'SPOON'         // Spoon-shaped with lip
  | 'PLUG'          // Plug-in with shelf clip
  | 'LOCKING'       // Pin with locking mechanism
  | 'GLASS'         // For glass shelves (rubber/plastic cushion)
  | 'HEAVY_DUTY';   // Reinforced for heavy loads

/**
 * Shelf pin materials
 */
export type ShelfPinMaterial =
  | 'STEEL_NICKEL'  // Nickel-plated steel
  | 'STEEL_ZINC'    // Zinc-plated steel
  | 'BRASS'         // Solid brass
  | 'PLASTIC'       // Nylon/plastic
  | 'STAINLESS';    // Stainless steel

// ============================================
// SHELF PIN SPECIFICATIONS
// ============================================

export interface ShelfPinSpec {
  id: string;
  name: string;
  nameTH: string;
  style: ShelfPinStyle;
  material: ShelfPinMaterial;

  // Pin dimensions
  pinDiameter: number;        // Diameter of pin shaft (mm)
  pinLength: number;          // Total pin length (mm)
  shelfSupportDepth: number;  // How much shelf rests on pin (mm)

  // Hole requirements
  holeDiameter: number;       // Boring diameter (mm)
  holeDepth: number;          // Boring depth (mm)
  holeTolerance: number;      // Diameter tolerance (±mm)

  // Load capacity
  maxLoadPerPin: number;      // Maximum load per pin (kg)
  recommendedPinsPerShelf: number;  // Typical pins per shelf

  // Compatibility
  minPanelThickness: number;  // Minimum side panel thickness (mm)
  system: ShelfPinSystem;

  // Special features
  hasShelfLip: boolean;       // Has lip to prevent shelf sliding
  hasLockingMechanism: boolean;
  suitableForGlass: boolean;

  // Catalog reference
  hafeleCode?: string;
  blumCode?: string;

  bestFor: string[];
}

// ============================================
// SHELF PIN CATALOG - Standard Pins
// ============================================

export const STANDARD_SHELF_PINS: ShelfPinSpec[] = [
  {
    id: 'PIN_5MM_STANDARD',
    name: '5mm Standard Shelf Pin',
    nameTH: 'พินชั้น 5มม. มาตรฐาน',
    style: 'STANDARD',
    material: 'STEEL_NICKEL',
    pinDiameter: 5,
    pinLength: 16,
    shelfSupportDepth: 10,
    holeDiameter: 5,
    holeDepth: 10,
    holeTolerance: 0.1,
    maxLoadPerPin: 15,
    recommendedPinsPerShelf: 4,
    minPanelThickness: 15,
    system: 'SYSTEM_32',
    hasShelfLip: false,
    hasLockingMechanism: false,
    suitableForGlass: false,
    hafeleCode: '282.04.700',
    bestFor: ['Standard shelving', 'Light to medium loads', 'General purpose'],
  },
  {
    id: 'PIN_5MM_SPOON',
    name: '5mm Spoon Shelf Support',
    nameTH: 'พินชั้นทรงช้อน 5มม.',
    style: 'SPOON',
    material: 'STEEL_NICKEL',
    pinDiameter: 5,
    pinLength: 20,
    shelfSupportDepth: 12,
    holeDiameter: 5,
    holeDepth: 10,
    holeTolerance: 0.1,
    maxLoadPerPin: 20,
    recommendedPinsPerShelf: 4,
    minPanelThickness: 15,
    system: 'SYSTEM_32',
    hasShelfLip: true,
    hasLockingMechanism: false,
    suitableForGlass: false,
    hafeleCode: '282.04.710',
    bestFor: ['Shelf stability', 'Prevents shelf sliding', 'Kitchen cabinets'],
  },
  {
    id: 'PIN_5MM_PLUG',
    name: '5mm Plug-in Shelf Support',
    nameTH: 'พินชั้นแบบปลั๊ก 5มม.',
    style: 'PLUG',
    material: 'PLASTIC',
    pinDiameter: 5,
    pinLength: 18,
    shelfSupportDepth: 14,
    holeDiameter: 5,
    holeDepth: 12,
    holeTolerance: 0.1,
    maxLoadPerPin: 12,
    recommendedPinsPerShelf: 4,
    minPanelThickness: 15,
    system: 'SYSTEM_32',
    hasShelfLip: true,
    hasLockingMechanism: true,
    suitableForGlass: false,
    hafeleCode: '282.10.700',
    bestFor: ['Budget option', 'Light loads', 'Closet shelving'],
  },
];

// ============================================
// SHELF PIN CATALOG - Heavy Duty
// ============================================

export const HEAVY_DUTY_SHELF_PINS: ShelfPinSpec[] = [
  {
    id: 'PIN_7MM_HEAVY',
    name: '7mm Heavy Duty Shelf Pin',
    nameTH: 'พินชั้นรับน้ำหนักมาก 7มม.',
    style: 'HEAVY_DUTY',
    material: 'STEEL_ZINC',
    pinDiameter: 7,
    pinLength: 20,
    shelfSupportDepth: 14,
    holeDiameter: 7,
    holeDepth: 12,
    holeTolerance: 0.1,
    maxLoadPerPin: 35,
    recommendedPinsPerShelf: 4,
    minPanelThickness: 18,
    system: 'SYSTEM_32',
    hasShelfLip: true,
    hasLockingMechanism: false,
    suitableForGlass: false,
    hafeleCode: '282.04.730',
    bestFor: ['Heavy loads', 'Book shelves', 'Garage cabinets'],
  },
  {
    id: 'PIN_5MM_LOCKING',
    name: '5mm Locking Shelf Support',
    nameTH: 'พินชั้นล็อคได้ 5มม.',
    style: 'LOCKING',
    material: 'STEEL_NICKEL',
    pinDiameter: 5,
    pinLength: 22,
    shelfSupportDepth: 15,
    holeDiameter: 5,
    holeDepth: 10,
    holeTolerance: 0.1,
    maxLoadPerPin: 25,
    recommendedPinsPerShelf: 4,
    minPanelThickness: 15,
    system: 'SYSTEM_32',
    hasShelfLip: true,
    hasLockingMechanism: true,
    suitableForGlass: false,
    hafeleCode: '282.04.750',
    bestFor: ['Secure shelving', 'Transport stability', 'Vibration environments'],
  },
];

// ============================================
// SHELF PIN CATALOG - Glass Shelf Supports
// ============================================

export const GLASS_SHELF_PINS: ShelfPinSpec[] = [
  {
    id: 'PIN_5MM_GLASS',
    name: '5mm Glass Shelf Support',
    nameTH: 'พินรับชั้นกระจก 5มม.',
    style: 'GLASS',
    material: 'STEEL_NICKEL',
    pinDiameter: 5,
    pinLength: 18,
    shelfSupportDepth: 10,
    holeDiameter: 5,
    holeDepth: 10,
    holeTolerance: 0.1,
    maxLoadPerPin: 10,
    recommendedPinsPerShelf: 4,
    minPanelThickness: 15,
    system: 'SYSTEM_32',
    hasShelfLip: true,
    hasLockingMechanism: false,
    suitableForGlass: true,
    hafeleCode: '282.14.700',
    bestFor: ['Glass shelves', 'Display cabinets', 'Curio cabinets'],
  },
  {
    id: 'PIN_5MM_GLASS_SUCTION',
    name: '5mm Glass Shelf Support with Suction',
    nameTH: 'พินรับชั้นกระจกแบบดูด 5มม.',
    style: 'GLASS',
    material: 'PLASTIC',
    pinDiameter: 5,
    pinLength: 16,
    shelfSupportDepth: 8,
    holeDiameter: 5,
    holeDepth: 10,
    holeTolerance: 0.1,
    maxLoadPerPin: 8,
    recommendedPinsPerShelf: 4,
    minPanelThickness: 15,
    system: 'SYSTEM_32',
    hasShelfLip: true,
    hasLockingMechanism: false,
    suitableForGlass: true,
    hafeleCode: '282.14.710',
    bestFor: ['Light glass shelves', 'Clean aesthetic', 'Display cases'],
  },
];

// ============================================
// COMBINED CATALOG
// ============================================

export const SHELF_PIN_CATALOG: ShelfPinSpec[] = [
  ...STANDARD_SHELF_PINS,
  ...HEAVY_DUTY_SHELF_PINS,
  ...GLASS_SHELF_PINS,
];

// ============================================
// SYSTEM 32 DRILLING PATTERN
// ============================================

export interface ShelfPinRowConfig {
  system: ShelfPinSystem;
  spacing: number;          // Hole spacing (32mm for System 32)
  rowCount: number;         // Number of rows (typically 1-2 per side)
  rowSpacing: number;       // Distance between rows (if multiple)
  startOffset: number;      // Distance from top of panel to first hole
  endOffset: number;        // Distance from bottom of panel to last hole
  frontSetback: number;     // Distance from front edge
  backSetback: number;      // Distance from back edge
}

export const DEFAULT_SYSTEM_32_CONFIG: ShelfPinRowConfig = {
  system: 'SYSTEM_32',
  spacing: 32,
  rowCount: 1,
  rowSpacing: 0,
  startOffset: 37,          // 37mm from top
  endOffset: 37,            // 37mm from bottom
  frontSetback: 37,         // 37mm from front edge
  backSetback: 37,          // 37mm from back edge (or second row position)
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get shelf pins by style
 */
export function getShelfPinsByStyle(style: ShelfPinStyle): ShelfPinSpec[] {
  return SHELF_PIN_CATALOG.filter((p) => p.style === style);
}

/**
 * Get shelf pins suitable for glass
 */
export function getGlassShelfPins(): ShelfPinSpec[] {
  return SHELF_PIN_CATALOG.filter((p) => p.suitableForGlass);
}

/**
 * Get shelf pin by ID
 */
export function getShelfPinById(id: string): ShelfPinSpec | undefined {
  return SHELF_PIN_CATALOG.find((p) => p.id === id);
}

/**
 * Calculate shelf pin hole positions for a panel
 * Returns Y positions from top of panel
 */
export function calculateShelfPinPositions(
  panelHeight: number,
  config: ShelfPinRowConfig = DEFAULT_SYSTEM_32_CONFIG
): number[] {
  const positions: number[] = [];
  const usableHeight = panelHeight - config.startOffset - config.endOffset;
  const holeCount = Math.floor(usableHeight / config.spacing) + 1;

  for (let i = 0; i < holeCount; i++) {
    const y = config.startOffset + i * config.spacing;
    if (y <= panelHeight - config.endOffset) {
      positions.push(y);
    }
  }

  return positions;
}

/**
 * Calculate total holes needed for a cabinet
 */
export function calculateTotalShelfPinHoles(
  panelHeight: number,
  panelCount: number = 2,  // Left and right side panels
  config: ShelfPinRowConfig = DEFAULT_SYSTEM_32_CONFIG
): {
  holesPerRow: number;
  rowsPerPanel: number;
  totalHoles: number;
  positions: number[];
} {
  const positions = calculateShelfPinPositions(panelHeight, config);
  const holesPerRow = positions.length;
  const rowsPerPanel = config.rowCount;
  const totalHoles = holesPerRow * rowsPerPanel * panelCount;

  return {
    holesPerRow,
    rowsPerPanel,
    totalHoles,
    positions,
  };
}

/**
 * Generate drilling pattern for CNC
 */
export interface ShelfPinDrillingPattern {
  panelSide: 'LEFT' | 'RIGHT';
  holes: Array<{
    x: number;      // From front edge
    y: number;      // From top edge
    diameter: number;
    depth: number;
  }>;
}

export function generateShelfPinDrillingPattern(
  panelHeight: number,
  panelDepth: number,
  pin: ShelfPinSpec,
  config: ShelfPinRowConfig = DEFAULT_SYSTEM_32_CONFIG,
  panelSide: 'LEFT' | 'RIGHT' = 'LEFT'
): ShelfPinDrillingPattern {
  const yPositions = calculateShelfPinPositions(panelHeight, config);
  const holes: ShelfPinDrillingPattern['holes'] = [];

  // Front row
  for (const y of yPositions) {
    holes.push({
      x: config.frontSetback,
      y,
      diameter: pin.holeDiameter,
      depth: pin.holeDepth,
    });
  }

  // Back row (if multiple rows)
  if (config.rowCount > 1) {
    const backX = panelDepth - config.backSetback;
    for (const y of yPositions) {
      holes.push({
        x: backX,
        y,
        diameter: pin.holeDiameter,
        depth: pin.holeDepth,
      });
    }
  }

  return {
    panelSide,
    holes,
  };
}

/**
 * Validate if shelf pin configuration is suitable
 */
export function validateShelfPinConfig(
  pin: ShelfPinSpec,
  panelThickness: number,
  shelfLoad: number,
  shelfWidth: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (panelThickness < pin.minPanelThickness) {
    warnings.push(`Panel thickness (${panelThickness}mm) is less than minimum (${pin.minPanelThickness}mm)`);
  }

  // Calculate load per pin (4 pins standard)
  const loadPerPin = shelfLoad / pin.recommendedPinsPerShelf;
  if (loadPerPin > pin.maxLoadPerPin) {
    warnings.push(`Load per pin (${loadPerPin.toFixed(1)}kg) exceeds capacity (${pin.maxLoadPerPin}kg)`);
  }

  // Wide shelves may need more pins
  if (shelfWidth > 800 && pin.recommendedPinsPerShelf === 4) {
    warnings.push('Wide shelf (>800mm): Consider using 6 pins instead of 4');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Get recommended shelf pin for application
 */
export function getRecommendedShelfPin(
  loadPerShelf: number,
  isGlassShelf: boolean = false
): ShelfPinSpec {
  if (isGlassShelf) {
    return SHELF_PIN_CATALOG.find((p) => p.id === 'PIN_5MM_GLASS')!;
  }

  if (loadPerShelf > 60) {
    return SHELF_PIN_CATALOG.find((p) => p.id === 'PIN_7MM_HEAVY')!;
  }

  if (loadPerShelf > 30) {
    return SHELF_PIN_CATALOG.find((p) => p.id === 'PIN_5MM_SPOON')!;
  }

  return SHELF_PIN_CATALOG.find((p) => p.id === 'PIN_5MM_STANDARD')!;
}
