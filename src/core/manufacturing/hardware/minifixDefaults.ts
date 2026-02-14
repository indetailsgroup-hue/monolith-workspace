/**
 * Minifix S200 Default Configurations
 *
 * Provides default Minifix S200 config for different wood thicknesses.
 * Used by cabinet store to auto-apply hardware config when cabinets are created.
 *
 * Data based on Häfele Minifix 15 catalog specifications.
 */

// ============================================
// MINIFIX CONFIG INTERFACE (Simplified)
// Full interface is in MinifixConfigPanel.tsx
// ============================================

export interface MinifixHardwareConfig {
  woodThickness: number;
  // Cam
  camDia: number;
  camDepth: number;
  camHeight: number;
  // Sleeve (for bolt hole)
  sleeveDia: number;
  sleeveLength: number;       // 14.25mm — assembly sleeve cylinder length
  /** Bolt hole drilling depth (17.5mm). Separate from sleeveLength (14.25mm assembly). */
  boltBoreDepth?: number;     // 17.5mm — manufacturing bolt bore depth
  // Bolt shaft
  shaftDia: number;
  shaftLength: number;
  // Dowel
  dowelDia: number;
  dowelLength: number;        // Total (edge + face = 18 + 12 = 30mm)
  dowelOffset: number;
  // HÄFELE STANDARD: Split depth for edge/face bore
  dowelDepthEdge?: number;    // 18mm - SIDE panel edge bore
  dowelDepthFace?: number;    // 12mm - TOP/BOTTOM face bore
}

// ============================================
// CAM SPECS BY WOOD THICKNESS (Häfele Catalog)
// ============================================

export const CAM_DRILLING_SPECS: Record<number, { drillingDepth: number; dimA: number }> = {
  12: { drillingDepth: 9.5, dimA: 6 },
  13: { drillingDepth: 11.0, dimA: 6.5 },
  15: { drillingDepth: 12.0, dimA: 7.5 },
  16: { drillingDepth: 12.5, dimA: 8 },
  18: { drillingDepth: 13.5, dimA: 9 },
  19: { drillingDepth: 14.0, dimA: 9.5 },
  22: { drillingDepth: 16.0, dimA: 11 },
  23: { drillingDepth: 16.5, dimA: 11.5 },
  26: { drillingDepth: 18.0, dimA: 13 },
  29: { drillingDepth: 19.5, dimA: 14.5 },
};

// ============================================
// DEFAULT S200 BOLT DIMENSIONS (Constant)
// ============================================

const S200_BOLT_DEFAULTS = {
  sleeveDia: 10,         // Sleeve Ø10mm
  sleeveLength: 14.25,   // Sleeve ASSEMBLY length 14.25mm (B = 3.25 + 6.5 + 14.25 = 24mm)
  boltBoreDepth: 17.5,   // Bolt DRILLING depth 17.5mm (Häfele S200 — NOT same as sleeveLength!)
  shaftDia: 5,           // Shaft Ø5mm
  shaftLength: 11,       // Shaft length 11mm
  dowelDia: 8,           // Dowel Ø8mm
  dowelLength: 30,       // Dowel length 30mm (total: edge + face)
  dowelOffset: 32,       // Dowel offset from cam (System 32)
  // HÄFELE STANDARD: Split depth prevents wood bulge in 16-19mm panels
  dowelDepthEdge: 18,    // 18mm into SIDE panel edge (EDGE_BORE)
  dowelDepthFace: 12,    // 12mm into TOP/BOTTOM face (FACE_BORE)
};

// ============================================
// HELPER: Get Config by Wood Thickness
// ============================================

/**
 * Get Minifix S200 hardware config for a given wood thickness.
 * Returns cam drilling specs specific to the wood thickness,
 * combined with standard S200 bolt dimensions.
 */
export function getMinifixDefaultConfig(woodThickness: number): MinifixHardwareConfig {
  // Find exact match or nearest available thickness
  const availableThicknesses = Object.keys(CAM_DRILLING_SPECS).map(Number);
  let targetThickness = woodThickness;

  if (!CAM_DRILLING_SPECS[woodThickness]) {
    // Find nearest available thickness
    targetThickness = availableThicknesses.reduce((prev, curr) =>
      Math.abs(curr - woodThickness) < Math.abs(prev - woodThickness) ? curr : prev
    );
  }

  const camSpec = CAM_DRILLING_SPECS[targetThickness];

  return {
    woodThickness: targetThickness,
    camDia: 15,                         // Minifix 15 standard
    camDepth: camSpec.drillingDepth,    // Drilling depth D
    camHeight: camSpec.dimA,            // Dim. A
    ...S200_BOLT_DEFAULTS,
  };
}

/**
 * Get the full MinifixFullConfig format (matching MinifixConfigPanel.tsx)
 * for use with the drill map generator and UI panels.
 */
export function getMinifixFullConfigForThickness(woodThickness: number) {
  const config = getMinifixDefaultConfig(woodThickness);

  return {
    minifixType: '15' as const,
    drillingDistanceB: 24 as const,  // 24mm per CAD spec
    woodThickness: config.woodThickness,
    // Ball Head - Häfele S200: Ø6.5mm (per catalog "Ø 6.5 mm bolt head")
    ballHeadDia: 6.5,
    ballHeadOffset: 0,
    // Neck Shaft - Häfele S200: Ø6.5mm × 6.5mm
    // B = Ball Head/2 (3.25) + Neck (6.5) + Sleeve (14.25) = 24mm
    neckShaftDia: 6.5,
    neckShaftLength: 6.5,
    neckShaftOffset: 0,
    // Sleeve (assembly visual = 14.25mm, drilling = 17.5mm)
    sleeveDia: config.sleeveDia,
    sleeveLength: config.sleeveLength,
    sleeveOffset: 0,
    boltBoreDepth: 17.5,  // Häfele S200 bolt drilling depth (NOT sleeveLength)
    // Shaft
    shaftDia: config.shaftDia,
    shaftLength: config.shaftLength,
    shaftOffset: 0,
    // Cam
    camDia: config.camDia,
    camDepth: config.camDepth,
    camHeight: config.camHeight,
    camRimDia: 18,
    camRimHeight: 2,
    camOffset: 0,
    // Dowel
    includeDowel: false,
    dowelDia: config.dowelDia,
    dowelLength: config.dowelLength,
    dowelOffset: config.dowelOffset,
    // HÄFELE STANDARD: Split depth (18mm edge + 12mm face = 30mm total)
    dowelDepthEdge: config.dowelDepthEdge ?? 18,
    dowelDepthFace: config.dowelDepthFace ?? 12,
    // Transform (default: no transformation)
    flipVertical: false,
    flipHorizontal: false,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    moveX: 0,
    moveY: 0,
    moveZ: 0,
    // Display Preferences
    showDimensions: true,
  };
}
