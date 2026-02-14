/**
 * System 32 Minifix & Dowel Placement Calculator
 *
 * Calculates drill positions for Minifix connectors following:
 * - System 32 grid (37mm setback, 32mm pitch)
 * - Häfele Minifix specifications (Dimension B = 24/34mm)
 *
 * ════════════════════════════════════════════════════════════════════════════
 * CRITICAL DISTINCTION:
 *
 * Dimension B (24/34mm) ≠ System 32 Pitch (32mm)
 *
 * • B = Horizontal Panel Edge → Housing Center (depth offset into material)
 * • Pitch = Bolt Center → Dowel Center (grid spacing along panel)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Reference:
 * - Häfele Minifix S200 Technical Documentation
 * - System 32 Cabinet Construction Standard
 *
 * @module system32MinifixPlacement
 */

// ============================================
// CONFIGURATION TYPES
// ============================================

/**
 * System 32 grid parameters
 */
export interface System32Config {
    /** Distance from front edge to first hole line (default: 37mm) */
    setback: number;
    /** Distance between hole lines (default: 32mm) */
    pitch: number;
}

/**
 * Minifix connector parameters based on Häfele specifications
 */
export interface MinifixConfig {
    /** Dimension B: distance from horizontal panel edge to housing center */
    dimensionB: 24 | 34;
    /** Cam housing diameter (Minifix 15 = 15mm, Minifix 12 = 12mm) */
    housingDiameter: number;
    /** Cam housing drilling depth (depends on panel thickness) */
    housingDepth: number;
    /** Bolt hole diameter (typically 10mm for sleeve or 5mm for shaft) */
    boltDiameter: number;
    /** Bolt hole depth (drilling into panel edge) */
    boltDepth: number;
}

/**
 * Dowel parameters
 */
export interface DowelConfig {
    /** Dowel diameter (typically 8mm) */
    diameter: number;
    /** Dowel hole depth */
    depth: number;
    /** Offset from bolt center (must be multiple of 32mm for System 32) */
    offsetFromBolt: number;
}

/**
 * Complete placement configuration
 */
export interface PlacementConfig {
    /** Panel thickness in mm (e.g., 16, 18, 19mm) */
    panelThickness: number;
    /** System 32 grid settings */
    system32: System32Config;
    /** Minifix connector settings */
    minifix: MinifixConfig;
    /** Dowel settings */
    dowel: DowelConfig;
}

// ============================================
// DEFAULT CONFIGURATIONS
// ============================================

/**
 * Default System 32 configuration
 */
export const DEFAULT_SYSTEM32: System32Config = {
    setback: 37,
    pitch: 32,
};

/**
 * Default Minifix S200 configuration for 19mm panels
 */
export const DEFAULT_MINIFIX: MinifixConfig = {
    dimensionB: 24,
    housingDiameter: 15,
    housingDepth: 14.0,  // For 19mm panel
    boltDiameter: 10,
    boltDepth: 17.5,
};

/**
 * Default dowel configuration
 */
export const DEFAULT_DOWEL: DowelConfig = {
    diameter: 8,
    depth: 15,
    offsetFromBolt: 32,  // One System 32 pitch
};

/**
 * Complete default configuration
 */
export const DEFAULT_PLACEMENT_CONFIG: PlacementConfig = {
    panelThickness: 19,
    system32: DEFAULT_SYSTEM32,
    minifix: DEFAULT_MINIFIX,
    dowel: DEFAULT_DOWEL,
};

// ============================================
// POSITION TYPES
// ============================================

/**
 * A drill position in panel-local coordinates
 */
export interface DrillPosition {
    /** X coordinate (along panel width/thickness axis) */
    x: number;
    /** Y coordinate (along panel height or depth axis) */
    y: number;
    /** Z coordinate (depth from front edge, System 32 axis) */
    z: number;
    /** Drill hole diameter */
    diameter: number;
    /** Drill hole depth */
    depth: number;
    /** Purpose of this drill hole */
    purpose: 'BOLT' | 'HOUSING' | 'DOWEL_SIDE' | 'DOWEL_HORIZONTAL';
}

/**
 * Complete joint positions for a Minifix + Dowel connection
 */
export interface MinifixJointPositions {
    /** Positions on the Side Panel (vertical panel, edge drilling) */
    sidePanel: {
        /** Bolt hole position (edge drilling into end grain) */
        bolt: DrillPosition;
        /** Dowel hole position (edge drilling, 32mm from bolt) */
        dowel: DrillPosition;
    };
    /** Positions on the Horizontal Panel (deck/shelf, face drilling) */
    horizontalPanel: {
        /** Housing pocket position (face drilling at Dimension B) */
        housing: DrillPosition;
        /** Dowel hole position (face drilling, aligned with side dowel) */
        dowel: DrillPosition;
    };
}

// ============================================
// CORE CALCULATION FUNCTIONS
// ============================================

/**
 * Calculate the System 32 Z position for a given position index.
 *
 * Position indices:
 * - 0 → 37mm (first hole at setback)
 * - 1 → 69mm (37 + 32)
 * - 2 → 101mm (37 + 64)
 * - n → setback + n × pitch
 *
 * @param index - Position index (0-based)
 * @param config - System 32 configuration
 * @returns Z position from front edge in mm
 */
export function calculateSystem32Position(
    index: number,
    config: System32Config = DEFAULT_SYSTEM32
): number {
    return config.setback + index * config.pitch;
}

/**
 * Calculate all System 32 positions that fit within a panel depth.
 *
 * @param panelDepth - Panel depth in mm
 * @param config - System 32 configuration
 * @param endMargin - Minimum margin from back edge (default: 10mm)
 * @returns Array of Z positions from front edge
 */
export function calculateAllSystem32Positions(
    panelDepth: number,
    config: System32Config = DEFAULT_SYSTEM32,
    endMargin: number = 10
): number[] {
    const positions: number[] = [];
    const maxZ = panelDepth - endMargin;

    let index = 0;
    let z = calculateSystem32Position(index, config);

    while (z <= maxZ) {
        positions.push(z);
        index++;
        z = calculateSystem32Position(index, config);
    }

    return positions;
}

/**
 * Calculate complete Minifix + Dowel joint positions for a corner connection.
 *
 * This function properly separates:
 * - Dimension B: Used for housing Y position on horizontal panel
 * - System 32 pitch: Used for bolt-dowel spacing
 *
 * @param panelHeight - Height of side panel (mm)
 * @param panelDepth - Depth of side panel from front to back (mm)
 * @param cornerType - 'TOP' or 'BOTTOM' corner
 * @param positionIndex - System 32 position index (0 = first at setback)
 * @param config - Placement configuration
 * @returns Complete joint positions
 */
export function calculateMinifixJointPositions(
    panelHeight: number,
    panelDepth: number,
    cornerType: 'TOP' | 'BOTTOM',
    positionIndex: number,
    config: PlacementConfig = DEFAULT_PLACEMENT_CONFIG
): MinifixJointPositions {
    const { panelThickness, system32, minifix, dowel } = config;

    // ════════════════════════════════════════════
    // SIDE PANEL CALCULATIONS (System 32 Grid)
    // ════════════════════════════════════════════

    // Z position: System 32 grid position from front edge
    const sys32Z = calculateSystem32Position(positionIndex, system32);

    // Y position: Edge offset based on panel thickness
    // Holes are drilled at half thickness from top/bottom edge
    const edgeOffset = panelThickness / 2;
    const boltY = cornerType === 'TOP'
        ? panelHeight - edgeOffset  // Near top edge
        : edgeOffset;               // Near bottom edge

    // X position: Center of panel thickness (for edge drilling)
    const boltX = panelThickness / 2;

    // Dowel Z position: Offset from bolt by specified amount (typically 32mm)
    const dowelZ = sys32Z + dowel.offsetFromBolt;

    // ════════════════════════════════════════════
    // HORIZONTAL PANEL CALCULATIONS
    // ════════════════════════════════════════════

    // Housing Y position: This is Dimension B!
    // NOT the System 32 pitch, but the internal offset of the connector
    const housingY = minifix.dimensionB;

    // Housing X position: Must align with bolt X for coaxial engagement
    const housingX = boltX;

    // Housing Z position: Same System 32 line as bolt
    const housingZ = sys32Z;

    // Dowel on horizontal panel: Aligned with side panel dowel
    const horizontalDowelY = housingY;  // Same depth as housing
    const horizontalDowelZ = dowelZ;    // Same Z as side dowel

    return {
        sidePanel: {
            bolt: {
                x: boltX,
                y: boltY,
                z: sys32Z,
                diameter: minifix.boltDiameter,
                depth: minifix.boltDepth,
                purpose: 'BOLT',
            },
            dowel: {
                x: boltX,
                y: boltY,
                z: dowelZ,
                diameter: dowel.diameter,
                depth: dowel.depth,
                purpose: 'DOWEL_SIDE',
            },
        },
        horizontalPanel: {
            housing: {
                x: housingX,
                y: housingY,  // ← DIMENSION B (24 or 34mm)
                z: housingZ,
                diameter: minifix.housingDiameter,
                depth: minifix.housingDepth,
                purpose: 'HOUSING',
            },
            dowel: {
                x: housingX,
                y: horizontalDowelY,
                z: horizontalDowelZ,
                diameter: dowel.diameter,
                depth: dowel.depth,
                purpose: 'DOWEL_HORIZONTAL',
            },
        },
    };
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validation result with details
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate that a Minifix joint is properly configured.
 *
 * Checks:
 * - Bolt and housing X positions are aligned (coaxial)
 * - Bolt and housing Z positions are aligned (same System 32 line)
 * - Dimension B is valid (24 or 34mm)
 * - Dowel is on System 32 pitch from bolt
 *
 * @param positions - Joint positions to validate
 * @param config - Placement configuration
 * @returns Validation result
 */
export function validateMinifixJoint(
    positions: MinifixJointPositions,
    config: PlacementConfig = DEFAULT_PLACEMENT_CONFIG
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const tolerance = 0.1;  // 0.1mm tolerance

    const { bolt, dowel: sideDowel } = positions.sidePanel;
    const { housing, dowel: horizontalDowel } = positions.horizontalPanel;

    // Check X alignment (coaxial engagement)
    if (Math.abs(bolt.x - housing.x) > tolerance) {
        errors.push(
            `X misalignment: Bolt X (${bolt.x.toFixed(2)}) ≠ Housing X (${housing.x.toFixed(2)})`
        );
    }

    // Check Z alignment (same System 32 line)
    if (Math.abs(bolt.z - housing.z) > tolerance) {
        errors.push(
            `Z misalignment: Bolt Z (${bolt.z.toFixed(2)}) ≠ Housing Z (${housing.z.toFixed(2)})`
        );
    }

    // Validate Dimension B
    const { dimensionB } = config.minifix;
    if (Math.abs(housing.y - dimensionB) > tolerance) {
        errors.push(
            `Housing Y (${housing.y.toFixed(2)}) does not match Dimension B (${dimensionB})`
        );
    }
    if (dimensionB !== 24 && dimensionB !== 34) {
        warnings.push(
            `Non-standard Dimension B: ${dimensionB}mm (expected 24 or 34)`
        );
    }

    // Validate dowel pitch from bolt
    const dowelOffset = sideDowel.z - bolt.z;
    if (Math.abs(dowelOffset % config.system32.pitch) > tolerance) {
        errors.push(
            `Dowel not on System 32 grid: offset ${dowelOffset.toFixed(2)}mm from bolt`
        );
    }

    // Validate dowel alignment between panels
    if (Math.abs(sideDowel.z - horizontalDowel.z) > tolerance) {
        errors.push(
            `Dowel Z misalignment: Side (${sideDowel.z.toFixed(2)}) ≠ Horizontal (${horizontalDowel.z.toFixed(2)})`
        );
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// ============================================
// HELPER: GET CONFIG FOR PANEL THICKNESS
// ============================================

/**
 * Housing depth by panel thickness (from Häfele catalog)
 */
const HOUSING_DEPTH_BY_THICKNESS: Record<number, number> = {
    12: 9.5,
    13: 11.0,
    15: 12.0,
    16: 12.5,
    18: 13.5,
    19: 14.0,
    22: 16.0,
    23: 16.5,
    26: 18.0,
    29: 19.5,
};

/**
 * Get placement configuration for a specific panel thickness.
 *
 * @param panelThickness - Panel thickness in mm
 * @param dimensionB - Minifix Dimension B (24 or 34mm)
 * @returns Placement configuration
 */
export function getConfigForThickness(
    panelThickness: number,
    dimensionB: 24 | 34 = 24
): PlacementConfig {
    // Find closest supported thickness for housing depth
    const supportedThicknesses = Object.keys(HOUSING_DEPTH_BY_THICKNESS).map(Number);
    const closestThickness = supportedThicknesses.reduce((prev, curr) =>
        Math.abs(curr - panelThickness) < Math.abs(prev - panelThickness) ? curr : prev
    );

    const housingDepth = HOUSING_DEPTH_BY_THICKNESS[closestThickness] ?? 12.5;

    return {
        ...DEFAULT_PLACEMENT_CONFIG,
        panelThickness,
        minifix: {
            ...DEFAULT_MINIFIX,
            dimensionB,
            housingDepth,
        },
    };
}

// ============================================
// EXPORTS
// ============================================

export default {
    calculateSystem32Position,
    calculateAllSystem32Positions,
    calculateMinifixJointPositions,
    validateMinifixJoint,
    getConfigForThickness,
    DEFAULT_PLACEMENT_CONFIG,
    DEFAULT_SYSTEM32,
    DEFAULT_MINIFIX,
    DEFAULT_DOWEL,
};
