/**
 * Wall Decoration Algorithms - Wainscoting, Slat, Hidden Door Systems
 *
 * ARCHITECTURE (North Star v4.0):
 * - Wainscoting panel distribution algorithms
 * - Slat/Batten spacing calculations
 * - Hidden door cladding continuity
 * - Attractor field deformation
 *
 * MATHEMATICAL FOUNDATIONS:
 * - Uniform distribution with integer panels
 * - Golden ratio proportions
 * - Triplanar texture mapping
 */

// ============================================
// WAINSCOTING SYSTEM (ลูกฟัก/ผนังบัวเชิง)
// ============================================

export type WainscotingStyle =
  | 'RAISED_PANEL'     // Classic raised panel
  | 'RECESSED_PANEL'   // Recessed/flat panel
  | 'BOARD_BATTEN'     // Board and batten
  | 'BEADBOARD'        // Vertical beadboard
  | 'SHAKER';          // Shaker style flat panel

export interface WainscotingParams {
  wallLength: number;              // L - Total wall length (mm)
  wallHeight: number;              // Total wall height (mm)
  wainscotHeight: number;          // Height of wainscoting (typically 900-1200mm)
  style: WainscotingStyle;

  // Panel preferences
  targetPanelWidth?: number;       // P_target - Desired panel width
  minPanelWidth?: number;          // Minimum acceptable panel width
  maxPanelWidth?: number;          // Maximum acceptable panel width

  // Stile (vertical frame) dimensions
  stileWidth: number;              // S - Stile/frame width (typically 75-100mm)

  // Material
  panelThickness: number;          // Panel material thickness
  frameThickness: number;          // Frame material thickness
}

export interface WainscotingResult {
  panelCount: number;              // n - Number of panels
  actualPanelWidth: number;        // P_real - Actual panel width
  stilePositions: number[];        // X positions of stiles
  panelPositions: number[];        // X positions of panel centers
  railHeight: number;              // Height of horizontal rails
  cutList: WainscotingCutItem[];   // Cut list for manufacturing
}

export interface WainscotingCutItem {
  name: string;
  quantity: number;
  width: number;
  height: number;
  material: 'panel' | 'frame';
}

/**
 * Wainscoting Panel Distribution Algorithm
 *
 * FORMULA:
 * n = round((L - S) / (P_target + S))
 * P_real = (L - (n + 1) * S) / n
 *
 * WHERE:
 * - L = Wall length
 * - S = Stile width
 * - P_target = Target panel width
 * - n = Number of panels (integer)
 * - P_real = Actual panel width (adjusted to fit exactly)
 *
 * @param params Wainscoting parameters
 * @returns Calculated panel layout
 */
export function calculateWainscoting(params: WainscotingParams): WainscotingResult {
  const {
    wallLength: L,
    wallHeight,
    wainscotHeight,
    stileWidth: S,
    targetPanelWidth = 400,
    minPanelWidth = 200,
    maxPanelWidth = 600,
    panelThickness,
    frameThickness,
  } = params;

  // Step 1: Calculate optimal panel count
  // n = round((L - S) / (P_target + S))
  let n = Math.round((L - S) / (targetPanelWidth + S));

  // Ensure at least 1 panel
  n = Math.max(1, n);

  // Step 2: Calculate actual panel width
  // P_real = (L - (n + 1) * S) / n
  let P_real = (L - (n + 1) * S) / n;

  // Step 3: Validate against min/max constraints
  if (P_real < minPanelWidth) {
    // Too narrow, reduce panel count
    n = Math.floor((L - S) / (minPanelWidth + S));
    n = Math.max(1, n);
    P_real = (L - (n + 1) * S) / n;
  } else if (P_real > maxPanelWidth) {
    // Too wide, increase panel count
    n = Math.ceil((L - S) / (maxPanelWidth + S));
    P_real = (L - (n + 1) * S) / n;
  }

  // Step 4: Calculate positions
  const stilePositions: number[] = [];
  const panelPositions: number[] = [];

  for (let i = 0; i <= n; i++) {
    // Stile position (left edge)
    const stileX = i * (P_real + S);
    stilePositions.push(stileX);

    // Panel center position (between stiles)
    if (i < n) {
      const panelCenterX = stileX + S + P_real / 2;
      panelPositions.push(panelCenterX);
    }
  }

  // Step 5: Calculate rail height (horizontal frame members)
  // Typically: top rail, bottom rail, and chair rail
  const bottomRailHeight = 100;  // 100mm from floor
  const topRailHeight = wainscotHeight - 75;  // 75mm from top
  const railHeight = topRailHeight - bottomRailHeight;

  // Step 6: Generate cut list
  const cutList: WainscotingCutItem[] = [
    // Stiles (vertical)
    {
      name: 'Stile',
      quantity: n + 1,
      width: S,
      height: wainscotHeight,
      material: 'frame',
    },
    // Top rail
    {
      name: 'Top Rail',
      quantity: 1,
      width: L,
      height: S,
      material: 'frame',
    },
    // Bottom rail
    {
      name: 'Bottom Rail',
      quantity: 1,
      width: L,
      height: S,
      material: 'frame',
    },
    // Panels
    {
      name: 'Panel',
      quantity: n,
      width: P_real,
      height: railHeight,
      material: 'panel',
    },
  ];

  return {
    panelCount: n,
    actualPanelWidth: Math.round(P_real * 10) / 10,  // Round to 0.1mm
    stilePositions,
    panelPositions,
    railHeight,
    cutList,
  };
}

// ============================================
// SLAT/BATTEN SPACING SYSTEM (ระแนง)
// ============================================

export interface SlatParams {
  wallLength: number;              // Total wall length (mm)
  wallHeight: number;              // Total wall height (mm)
  slatWidth: number;               // W_slat - Individual slat width
  targetGap?: number;              // G_target - Desired gap between slats
  orientation: 'VERTICAL' | 'HORIZONTAL';
  startOffset?: number;            // Offset from wall edge
  endOffset?: number;              // Offset from opposite edge
}

export interface SlatResult {
  slatCount: number;               // Number of slats
  actualGap: number;               // Actual gap (adjusted)
  positions: number[];             // Position of each slat center
  totalCoverage: number;           // Total width/height covered
  cutList: { width: number; height: number; quantity: number }[];
}

/**
 * Slat Spacing Algorithm
 *
 * FORMULA:
 * n = round((L - W_slat) / (W_slat + G_target))
 * G_real = (L - (n * W_slat)) / (n + 1)
 *
 * ENSURES: Slats are evenly distributed with equal gaps
 *
 * @param params Slat parameters
 * @returns Calculated slat layout
 */
export function calculateSlatSpacing(params: SlatParams): SlatResult {
  const {
    wallLength,
    wallHeight,
    slatWidth,
    targetGap = 50,
    orientation,
    startOffset = 0,
    endOffset = 0,
  } = params;

  // Effective length for slat distribution
  const L = (orientation === 'VERTICAL' ? wallLength : wallHeight)
    - startOffset - endOffset;

  // Calculate optimal slat count
  // n = round((L - W_slat) / (W_slat + G_target)) + 1
  let n = Math.round((L - slatWidth) / (slatWidth + targetGap)) + 1;
  n = Math.max(1, n);

  // Calculate actual gap
  // G_real = (L - (n * W_slat)) / (n + 1)
  // But for edge-to-edge: G_real = (L - (n * W_slat)) / (n - 1) when gaps are between slats only
  const totalSlatWidth = n * slatWidth;

  let G_real: number;
  if (n > 1) {
    // Gap between slats (not at edges)
    G_real = (L - totalSlatWidth) / (n - 1);
  } else {
    // Single slat centered
    G_real = (L - slatWidth) / 2;
  }

  // Calculate positions (center of each slat)
  const positions: number[] = [];
  for (let i = 0; i < n; i++) {
    if (n > 1) {
      const pos = startOffset + slatWidth / 2 + i * (slatWidth + G_real);
      positions.push(Math.round(pos * 10) / 10);
    } else {
      positions.push(startOffset + L / 2);
    }
  }

  // Calculate cut dimensions
  const cutWidth = orientation === 'VERTICAL' ? slatWidth : wallLength;
  const cutHeight = orientation === 'VERTICAL' ? wallHeight : slatWidth;

  return {
    slatCount: n,
    actualGap: Math.round(G_real * 10) / 10,
    positions,
    totalCoverage: totalSlatWidth + (n - 1) * G_real,
    cutList: [
      { width: cutWidth, height: cutHeight, quantity: n },
    ],
  };
}

// ============================================
// HIDDEN DOOR CLADDING (ประตูซ่อน)
// ============================================

export interface HiddenDoorParams {
  wallLength: number;              // Total wall length
  doorPosition: number;            // X position of door left edge
  doorWidth: number;               // Door width
  doorHeight: number;              // Door height
  claddingPattern: 'SLAT' | 'PANEL' | 'WAINSCOTING';
  patternParams: SlatParams | WainscotingParams;
}

export interface HiddenDoorResult {
  wallSegments: {
    left: { start: number; end: number; claddingIndices: number[] };
    door: { start: number; end: number; claddingIndices: number[] };
    right: { start: number; end: number; claddingIndices: number[] };
  };
  claddingContinuity: boolean;     // True if pattern aligns across door
  doorCladdingPositions: number[]; // Cladding positions on door surface
  adjustments: string[];           // Any adjustments made for continuity
}

/**
 * Hidden Door Cladding Continuity Algorithm
 *
 * PRINCIPLE: The cladding pattern on the door must align perfectly
 * with the wall pattern to create seamless hidden door effect.
 *
 * STEPS:
 * 1. Calculate full wall cladding pattern
 * 2. Identify which elements fall on door area
 * 3. Transfer those elements to door surface
 * 4. Verify alignment at door edges
 *
 * @param params Hidden door parameters
 * @returns Door cladding layout with continuity info
 */
export function calculateHiddenDoorCladding(params: HiddenDoorParams): HiddenDoorResult {
  const {
    wallLength,
    doorPosition,
    doorWidth,
    doorHeight,
    claddingPattern,
    patternParams,
  } = params;

  const doorEnd = doorPosition + doorWidth;
  const adjustments: string[] = [];

  // Calculate full wall pattern
  let fullWallPositions: number[] = [];

  if (claddingPattern === 'SLAT') {
    const result = calculateSlatSpacing(patternParams as SlatParams);
    fullWallPositions = result.positions;
  } else if (claddingPattern === 'WAINSCOTING') {
    const result = calculateWainscoting(patternParams as WainscotingParams);
    fullWallPositions = result.panelPositions;
  }

  // Categorize positions
  const leftWallIndices: number[] = [];
  const doorIndices: number[] = [];
  const rightWallIndices: number[] = [];

  fullWallPositions.forEach((pos, idx) => {
    if (pos < doorPosition) {
      leftWallIndices.push(idx);
    } else if (pos >= doorPosition && pos <= doorEnd) {
      doorIndices.push(idx);
    } else {
      rightWallIndices.push(idx);
    }
  });

  // Calculate door-local positions (relative to door left edge)
  const doorCladdingPositions = doorIndices.map(idx =>
    fullWallPositions[idx] - doorPosition
  );

  // Check continuity at door edges
  let claddingContinuity = true;

  // Left edge check: nearest cladding to door should have consistent gap
  if (leftWallIndices.length > 0 && doorIndices.length > 0) {
    const lastLeftPos = fullWallPositions[leftWallIndices[leftWallIndices.length - 1]];
    const firstDoorPos = fullWallPositions[doorIndices[0]];
    const gapAtLeftEdge = firstDoorPos - lastLeftPos;

    // Compare with typical gap
    const typicalGap = fullWallPositions.length > 1
      ? fullWallPositions[1] - fullWallPositions[0]
      : 0;

    if (Math.abs(gapAtLeftEdge - typicalGap) > 5) {
      claddingContinuity = false;
      adjustments.push(`Left edge gap (${Math.round(gapAtLeftEdge)}mm) differs from pattern gap (${Math.round(typicalGap)}mm)`);
    }
  }

  // Right edge check
  if (doorIndices.length > 0 && rightWallIndices.length > 0) {
    const lastDoorPos = fullWallPositions[doorIndices[doorIndices.length - 1]];
    const firstRightPos = fullWallPositions[rightWallIndices[0]];
    const gapAtRightEdge = firstRightPos - lastDoorPos;

    const typicalGap = fullWallPositions.length > 1
      ? fullWallPositions[1] - fullWallPositions[0]
      : 0;

    if (Math.abs(gapAtRightEdge - typicalGap) > 5) {
      claddingContinuity = false;
      adjustments.push(`Right edge gap (${Math.round(gapAtRightEdge)}mm) differs from pattern gap (${Math.round(typicalGap)}mm)`);
    }
  }

  return {
    wallSegments: {
      left: {
        start: 0,
        end: doorPosition,
        claddingIndices: leftWallIndices,
      },
      door: {
        start: doorPosition,
        end: doorEnd,
        claddingIndices: doorIndices,
      },
      right: {
        start: doorEnd,
        end: wallLength,
        claddingIndices: rightWallIndices,
      },
    },
    claddingContinuity,
    doorCladdingPositions,
    adjustments,
  };
}

// ============================================
// ATTRACTOR FIELD DEFORMATION
// ============================================

export interface AttractorPoint {
  x: number;
  y: number;
  strength: number;     // A - Amplitude of deformation
  radius: number;       // Effective radius
}

/**
 * Attractor Field Deformation Algorithm
 *
 * FORMULA: Z_i = Z_base + A / (1 + d_i^2)
 *
 * WHERE:
 * - Z_i = Deformed Z position of point i
 * - Z_base = Original Z position (flat surface)
 * - A = Attractor strength (amplitude)
 * - d_i = Distance from attractor to point i
 *
 * USAGE: Creates organic, flowing surface deformations
 * for artistic wall panels
 *
 * @param gridPoints Points on surface grid
 * @param attractors List of attractor points
 * @param baseZ Base Z height
 * @returns Deformed Z values for each grid point
 */
export function calculateAttractorDeformation(
  gridPoints: Array<{ x: number; y: number }>,
  attractors: AttractorPoint[],
  baseZ: number = 0
): number[] {
  return gridPoints.map(point => {
    let totalDeformation = 0;

    for (const attractor of attractors) {
      // Calculate distance squared
      const dx = point.x - attractor.x;
      const dy = point.y - attractor.y;
      const d_squared = dx * dx + dy * dy;

      // Normalize by radius
      const normalizedD_squared = d_squared / (attractor.radius * attractor.radius);

      // Apply inverse-square falloff: A / (1 + d^2)
      const deformation = attractor.strength / (1 + normalizedD_squared);
      totalDeformation += deformation;
    }

    return baseZ + totalDeformation;
  });
}

// ============================================
// TRIPLANAR TEXTURE MAPPING
// ============================================

export interface TriplanarWeights {
  x: number;
  y: number;
  z: number;
}

/**
 * Calculate Triplanar Mapping Weights
 *
 * FORMULA: C_final = C_x * |n_x| + C_y * |n_y| + C_z * |n_z|
 *
 * WHERE:
 * - C_x, C_y, C_z = Texture samples from each axis projection
 * - n_x, n_y, n_z = Surface normal components (normalized)
 *
 * PURPOSE: Seamlessly texture complex shapes without
 * UV coordinate discontinuities
 *
 * @param normal Surface normal vector [nx, ny, nz]
 * @returns Blend weights for each axis texture
 */
export function calculateTriplanarWeights(
  normal: [number, number, number]
): TriplanarWeights {
  const [nx, ny, nz] = normal;

  // Take absolute values
  const absX = Math.abs(nx);
  const absY = Math.abs(ny);
  const absZ = Math.abs(nz);

  // Normalize so weights sum to 1
  const sum = absX + absY + absZ;

  if (sum === 0) {
    // Degenerate case: default to Z-up
    return { x: 0, y: 0, z: 1 };
  }

  return {
    x: absX / sum,
    y: absY / sum,
    z: absZ / sum,
  };
}

/**
 * Apply sharpening to triplanar weights
 *
 * Higher sharpness reduces blending between projections
 * for sharper transitions on edges
 *
 * @param weights Raw triplanar weights
 * @param sharpness Sharpening exponent (1 = linear, 4 = sharp)
 * @returns Sharpened weights
 */
export function sharpenTriplanarWeights(
  weights: TriplanarWeights,
  sharpness: number = 4
): TriplanarWeights {
  const x = Math.pow(weights.x, sharpness);
  const y = Math.pow(weights.y, sharpness);
  const z = Math.pow(weights.z, sharpness);

  const sum = x + y + z;

  return {
    x: x / sum,
    y: y / sum,
    z: z / sum,
  };
}

// ============================================
// HIDDEN DOOR HINGE MECHANICS
// ============================================

/**
 * Hidden Door Hinge Types
 *
 * SOSS: Invisible hinge, completely concealed when closed
 * PIVOT: Floor/ceiling mounted pivot point
 * CONTINUOUS: Piano hinge (visible but minimal)
 * EUROPEAN: Cup hinge (semi-concealed)
 */
export type HiddenHingeType = 'SOSS' | 'PIVOT' | 'CONTINUOUS' | 'EUROPEAN';

export interface HiddenHingeSpec {
  type: HiddenHingeType;
  name: string;
  nameTH: string;

  // Physical dimensions
  mortiseDepth: number;          // Depth of mortise required (mm)
  mortiseWidth: number;          // Width of mortise (mm)
  mortiseHeight: number;         // Height of mortise (mm)

  // Load capacity
  maxDoorWeight: number;         // Maximum door weight per hinge (kg)
  maxDoorWidth: number;          // Maximum door width (mm)
  maxDoorHeight: number;         // Maximum door height for single hinge (mm)

  // Clearance requirements
  closedGap: number;             // Gap when closed (mm) - critical for hidden doors
  openingAngle: number;          // Maximum opening angle (degrees)

  // E-dimension: distance from hinge center to door edge
  eDimension: number;            // mm - affects swing clearance
}

export const HIDDEN_HINGE_SPECS: Record<HiddenHingeType, HiddenHingeSpec[]> = {
  SOSS: [
    // SOSS 101 - Light duty
    {
      type: 'SOSS',
      name: 'SOSS 101 (Light)',
      nameTH: 'SOSS 101 งานเบา',
      mortiseDepth: 11,
      mortiseWidth: 13,
      mortiseHeight: 58,
      maxDoorWeight: 11,
      maxDoorWidth: 600,
      maxDoorHeight: 750,
      closedGap: 0.4,  // 1/64"
      openingAngle: 180,
      eDimension: 6.4,
    },
    // SOSS 212 - Medium duty
    {
      type: 'SOSS',
      name: 'SOSS 212 (Medium)',
      nameTH: 'SOSS 212 งานกลาง',
      mortiseDepth: 14,
      mortiseWidth: 16,
      mortiseHeight: 89,
      maxDoorWeight: 27,
      maxDoorWidth: 900,
      maxDoorHeight: 1500,
      closedGap: 0.4,
      openingAngle: 180,
      eDimension: 7.9,
    },
    // SOSS 218 - Heavy duty
    {
      type: 'SOSS',
      name: 'SOSS 218 (Heavy)',
      nameTH: 'SOSS 218 งานหนัก',
      mortiseDepth: 19,
      mortiseWidth: 22,
      mortiseHeight: 114,
      maxDoorWeight: 54,
      maxDoorWidth: 1200,
      maxDoorHeight: 2400,
      closedGap: 0.4,
      openingAngle: 180,
      eDimension: 11.1,
    },
  ],
  PIVOT: [
    {
      type: 'PIVOT',
      name: 'Floor Pivot Hinge',
      nameTH: 'บานพับจุดหมุนพื้น',
      mortiseDepth: 25,
      mortiseWidth: 150,
      mortiseHeight: 50,
      maxDoorWeight: 150,
      maxDoorWidth: 1500,
      maxDoorHeight: 3000,
      closedGap: 3,
      openingAngle: 180,
      eDimension: 0,  // Pivot at edge
    },
  ],
  CONTINUOUS: [
    {
      type: 'CONTINUOUS',
      name: 'Piano Hinge',
      nameTH: 'บานพับเปียโน',
      mortiseDepth: 1.5,
      mortiseWidth: 50,
      mortiseHeight: 0,  // Full height
      maxDoorWeight: 100,
      maxDoorWidth: 1000,
      maxDoorHeight: 2400,
      closedGap: 2,
      openingAngle: 270,
      eDimension: 25,
    },
  ],
  EUROPEAN: [
    {
      type: 'EUROPEAN',
      name: '35mm Cup Hinge',
      nameTH: 'บานพับถ้วย 35mm',
      mortiseDepth: 12,
      mortiseWidth: 35,
      mortiseHeight: 35,
      maxDoorWeight: 15,
      maxDoorWidth: 600,
      maxDoorHeight: 900,
      closedGap: 3,
      openingAngle: 110,
      eDimension: 4,
    },
  ],
};

/**
 * Hinge Spacing Rule
 *
 * PRINCIPLE: At least 1 hinge per 30 inches (762mm) of door height
 * BEST PRACTICE: Second hinge close to top for tension support
 *
 * @param doorHeight Door height in mm
 * @param hingeType Type of hinge
 * @returns Required hinge count and positions
 */
export function calculateHingeSpacing(
  doorHeight: number,
  hingeType: HiddenHingeType = 'SOSS'
): {
  hingeCount: number;
  positions: number[];  // Distance from top
  warnings: string[];
} {
  const warnings: string[] = [];

  // Rule: 1 hinge per 762mm (30")
  const hingeCount = Math.max(2, Math.ceil(doorHeight / 762));

  // Position calculation
  const positions: number[] = [];
  const topMargin = 150;     // 150mm from top
  const bottomMargin = 200;  // 200mm from bottom

  if (hingeCount === 2) {
    positions.push(topMargin);
    positions.push(doorHeight - bottomMargin);
  } else if (hingeCount === 3) {
    positions.push(topMargin);
    positions.push(doorHeight / 2);
    positions.push(doorHeight - bottomMargin);
  } else {
    // More than 3 hinges: distribute evenly
    positions.push(topMargin);
    const middleSpace = doorHeight - topMargin - bottomMargin;
    const middleSpacing = middleSpace / (hingeCount - 1);

    for (let i = 1; i < hingeCount - 1; i++) {
      positions.push(topMargin + (i * middleSpacing));
    }
    positions.push(doorHeight - bottomMargin);
  }

  // Best practice warning
  if (hingeCount >= 3) {
    // Check if second hinge is close to first (within 300mm)
    if (positions[1] - positions[0] > 300) {
      warnings.push('Consider placing second hinge closer to top for better tension support');
    }
  }

  return { hingeCount, positions, warnings };
}

/**
 * Floor Clearance Calculation
 *
 * PRINCIPLE: Door bottom must clear floor during swing
 * STANDARD: 1/4" (6.4mm) to 1/8" (3.2mm) clearance
 *
 * FACTORS:
 * - Floor levelness tolerance
 * - Carpet/flooring thickness
 * - Door sag over time
 */
export interface FloorClearanceParams {
  floorType: 'TILE' | 'WOOD' | 'CARPET' | 'CONCRETE';
  floorLevelTolerance: number;  // mm deviation from level
  doorSagAllowance: number;     // mm expected sag over time
}

export function calculateFloorClearance(
  params: FloorClearanceParams
): {
  minClearance: number;
  recommendedClearance: number;
  notes: string[];
} {
  const {
    floorType,
    floorLevelTolerance = 3,
    doorSagAllowance = 1,
  } = params;

  // Base clearance by floor type
  const baseClearance: Record<string, number> = {
    TILE: 3.2,      // 1/8" - minimal
    WOOD: 4.8,      // 3/16" - slight expansion
    CARPET: 12.7,   // 1/2" - carpet pile height
    CONCRETE: 3.2,  // 1/8" - minimal
  };

  const base = baseClearance[floorType] || 6.4;
  const minClearance = base + floorLevelTolerance;
  const recommendedClearance = minClearance + doorSagAllowance + 1; // +1mm safety

  const notes: string[] = [];
  if (floorType === 'CARPET') {
    notes.push('Consider door sweep or threshold for carpet applications');
  }
  if (floorLevelTolerance > 5) {
    notes.push('High floor tolerance - verify clearance at all swing positions');
  }

  return {
    minClearance: Math.round(minClearance * 10) / 10,
    recommendedClearance: Math.round(recommendedClearance * 10) / 10,
    notes,
  };
}

/**
 * Door Swing Kinematics - Binding Prevention
 *
 * PROBLEM: When cladding is applied to hidden door, the thickness
 * creates a radius that can bind against the frame during swing.
 *
 * SOLUTION: Calculate chamfer angle and backset to prevent binding
 *
 * FORMULA:
 * For 180° opening without binding:
 * Chamfer_angle = arctan(cladding_thickness / door_thickness)
 * Backset = E_dimension + cladding_thickness
 */
export interface DoorCladdingParams {
  doorThickness: number;         // Base door thickness (mm)
  claddingThickness: number;     // Thickness of cladding material (mm)
  hingeType: HiddenHingeType;
  hingeModel: number;            // Index into HIDDEN_HINGE_SPECS array
  desiredOpeningAngle: number;   // Degrees
}

export interface SwingKinematicsResult {
  requiresChamfer: boolean;
  chamferAngle: number;          // Degrees
  chamferDepth: number;          // mm - how deep to cut
  backsetRequired: number;       // mm - door edge to frame distance
  maxCladdingThickness: number;  // mm - before binding occurs
  bindingRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  recommendations: string[];
}

export function calculateSwingKinematics(
  params: DoorCladdingParams
): SwingKinematicsResult {
  const {
    doorThickness,
    claddingThickness,
    hingeType,
    hingeModel = 0,
    desiredOpeningAngle,
  } = params;

  const hingeSpec = HIDDEN_HINGE_SPECS[hingeType][hingeModel];
  const recommendations: string[] = [];

  // E-dimension is the critical factor
  const eDim = hingeSpec.eDimension;

  // Calculate swing radius
  // The outer corner of cladding traces an arc during swing
  const swingRadius = Math.sqrt(
    Math.pow(eDim + claddingThickness, 2) +
    Math.pow(doorThickness / 2, 2)
  );

  // Check if cladding will bind
  // Binding occurs when swing radius > E-dimension + gap
  const availableSpace = eDim + hingeSpec.closedGap;
  const requiresChamfer = swingRadius > availableSpace && desiredOpeningAngle > 90;

  // Calculate chamfer if needed
  let chamferAngle = 0;
  let chamferDepth = 0;

  if (requiresChamfer) {
    // 45-degree chamfer is standard for most applications
    chamferAngle = 45;
    // Depth needed to clear the swing arc
    chamferDepth = claddingThickness - (availableSpace - eDim);
    chamferDepth = Math.max(0, chamferDepth);
  }

  // Calculate required backset
  const backsetRequired = eDim + claddingThickness + 2; // +2mm safety

  // Maximum cladding before binding (without chamfer)
  const maxCladdingThickness = Math.max(0, availableSpace - eDim);

  // Risk assessment
  let bindingRisk: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  if (!requiresChamfer) {
    bindingRisk = 'NONE';
  } else if (claddingThickness <= maxCladdingThickness * 1.5) {
    bindingRisk = 'LOW';
    recommendations.push('45° chamfer recommended on hinge-side cladding edge');
  } else if (claddingThickness <= maxCladdingThickness * 2) {
    bindingRisk = 'MEDIUM';
    recommendations.push('45° chamfer required');
    recommendations.push('Consider reducing cladding thickness');
  } else {
    bindingRisk = 'HIGH';
    recommendations.push('Cladding too thick for this hinge type');
    recommendations.push('Use pivot hinge or reduce cladding');
  }

  // Opening angle limitation
  if (desiredOpeningAngle > hingeSpec.openingAngle) {
    recommendations.push(
      `Hinge max opening: ${hingeSpec.openingAngle}°. ` +
      `Requested: ${desiredOpeningAngle}°. Consider different hinge.`
    );
  }

  return {
    requiresChamfer,
    chamferAngle: Math.round(chamferAngle),
    chamferDepth: Math.round(chamferDepth * 10) / 10,
    backsetRequired: Math.round(backsetRequired * 10) / 10,
    maxCladdingThickness: Math.round(maxCladdingThickness * 10) / 10,
    bindingRisk,
    recommendations,
  };
}

/**
 * Calculate total door weight with cladding
 *
 * Used to verify hinge load capacity
 */
export function calculateDoorWeight(
  doorWidth: number,
  doorHeight: number,
  doorThickness: number,
  doorMaterialDensity: number,   // kg/m³ (MDF ~750, Plywood ~550)
  claddingThickness: number,
  claddingDensity: number,       // kg/m³ (Wood ~600, MDF ~750)
  claddingCoverage: number = 1   // Fraction of door covered (0-1)
): {
  doorWeight: number;
  claddingWeight: number;
  totalWeight: number;
  hingeCountRequired: number;
} {
  // Convert mm to m for volume calculation
  const doorVolume = (doorWidth / 1000) * (doorHeight / 1000) * (doorThickness / 1000);
  const doorWeight = doorVolume * doorMaterialDensity;

  const claddingVolume = (doorWidth / 1000) * (doorHeight / 1000) *
    (claddingThickness / 1000) * claddingCoverage;
  const claddingWeight = claddingVolume * claddingDensity;

  const totalWeight = doorWeight + claddingWeight;

  // Recommend hinge count based on weight (SOSS 218 = 54kg per hinge)
  // Safety factor of 2x
  const hingeCountRequired = Math.ceil((totalWeight * 2) / 54);

  return {
    doorWeight: Math.round(doorWeight * 10) / 10,
    claddingWeight: Math.round(claddingWeight * 10) / 10,
    totalWeight: Math.round(totalWeight * 10) / 10,
    hingeCountRequired: Math.max(2, hingeCountRequired),
  };
}

// ============================================
// GOLDEN RATIO PANEL PROPORTIONS
// ============================================

export const PHI = 1.618033988749895;  // Golden ratio

/**
 * Calculate Golden Ratio Panel Dimensions
 *
 * Given one dimension, calculate the other using phi
 *
 * @param knownDimension The known width or height
 * @param knownIs 'width' or 'height'
 * @returns Both dimensions with golden ratio
 */
export function calculateGoldenRatioDimensions(
  knownDimension: number,
  knownIs: 'width' | 'height'
): { width: number; height: number } {
  if (knownIs === 'width') {
    return {
      width: knownDimension,
      height: Math.round(knownDimension / PHI),
    };
  } else {
    return {
      width: Math.round(knownDimension * PHI),
      height: knownDimension,
    };
  }
}

/**
 * Check if dimensions are close to golden ratio
 *
 * @param width Panel width
 * @param height Panel height
 * @param tolerance Acceptable deviation (default 5%)
 * @returns True if within tolerance of golden ratio
 */
export function isGoldenRatio(
  width: number,
  height: number,
  tolerance: number = 0.05
): boolean {
  const ratio = Math.max(width, height) / Math.min(width, height);
  return Math.abs(ratio - PHI) / PHI <= tolerance;
}
