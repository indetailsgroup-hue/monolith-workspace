/**
 * Kerf Bending Algorithms - Curved Panel Manufacturing
 *
 * ARCHITECTURE (North Star v4.0):
 * - Mathematical formulas for kerf cutting
 * - Material-specific web thickness constraints
 * - CNC toolpath parameter generation
 *
 * PHYSICS PRINCIPLE:
 * Kerf bending creates flexibility by removing material (kerfs)
 * from the back of a rigid panel, allowing it to bend without
 * breaking. The uncut "web" provides structural integrity.
 *
 * KEY FORMULAS:
 * - ΔL = 2πT × (θ/360) : Arc length difference between faces
 * - N = ΔL / K : Number of kerfs needed
 * - S = L_out / N : Spacing between kerfs
 */

// ============================================
// TYPES & INTERFACES
// ============================================

export type KerfMaterial = 'MDF' | 'PLYWOOD' | 'PARTICLE_BOARD' | 'HMR';

export type KerfProfile =
  | 'STRAIGHT'      // Parallel straight cuts (most common)
  | 'CROSS_HATCH'   // X pattern for compound curves
  | 'RADIAL'        // Fan pattern from center
  | 'LIVING_HINGE'; // Alternating offset cuts (maximum flexibility)

export interface KerfBendingParams {
  // Panel dimensions
  panelThickness: number;      // T - Panel thickness (mm)
  panelWidth: number;          // Panel width (mm)
  panelLength: number;         // L_panel - Panel length along bend (mm)

  // Bend parameters
  bendRadius: number;          // R - Inner bend radius (mm)
  bendAngle: number;           // θ - Bend angle (degrees)

  // Material
  material: KerfMaterial;

  // Kerf profile
  profile: KerfProfile;

  // Tool parameters
  kerfWidth?: number;          // K - Kerf/slot width (blade/bit width)
  webThickness?: number;       // W - Remaining material thickness (auto-calculated if not provided)
}

export interface KerfBendingResult {
  // Calculated values
  arcLengthOuter: number;      // L_out - Arc length on outer (kerf) face
  arcLengthInner: number;      // L_in - Arc length on inner face
  arcLengthDelta: number;      // ΔL - Difference that kerfs must accommodate

  // Kerf parameters
  kerfCount: number;           // N - Number of kerfs
  kerfSpacing: number;         // S - Center-to-center spacing
  kerfDepth: number;           // D_kerf - Depth of kerf cut
  webThickness: number;        // W - Remaining web thickness

  // Verification
  minBendRadius: number;       // Minimum achievable radius
  safetyFactor: number;        // How much margin we have
  warnings: string[];          // Any warnings

  // CNC parameters
  cncParams: KerfCNCParams;
}

export interface KerfCNCParams {
  toolDiameter: number;        // Bit/blade diameter
  cutDepth: number;            // Depth of cut
  feedRate: number;            // mm/min recommended
  spindleSpeed: number;        // RPM recommended
  passes: number;              // Number of passes (if deep cut)
  startPosition: number;       // First kerf position from edge
  endPosition: number;         // Last kerf position from edge
}

// ============================================
// MATERIAL CONSTANTS
// ============================================

/**
 * Minimum Web Thickness by Material
 *
 * The web is the uncut portion that holds the panel together.
 * Too thin = breaks during bending
 * Too thick = won't bend smoothly
 */
export const WEB_THICKNESS_LIMITS: Record<KerfMaterial, {
  min: number;      // Absolute minimum (mm)
  recommended: number;  // Recommended minimum (mm)
  maxRatio: number;    // Max web as ratio of thickness
}> = {
  MDF: {
    min: 1.5,
    recommended: 2.0,
    maxRatio: 0.2,     // Web should be 15-20% of thickness
  },
  PLYWOOD: {
    min: 1.0,
    recommended: 1.5,
    maxRatio: 0.15,    // Plywood is more flexible
  },
  PARTICLE_BOARD: {
    min: 2.0,
    recommended: 2.5,
    maxRatio: 0.25,    // Particle board is brittle
  },
  HMR: {
    min: 1.5,
    recommended: 2.0,
    maxRatio: 0.2,     // Similar to MDF
  },
};

/**
 * Minimum Bend Radius by Material and Thickness
 *
 * R_min = f(T, material)
 * Tighter bends = more stress = more likely to break
 */
export function getMinimumBendRadius(
  thickness: number,
  material: KerfMaterial
): number {
  // General formula: R_min = T * multiplier
  const multipliers: Record<KerfMaterial, number> = {
    MDF: 8,           // R_min = 8 * T
    PLYWOOD: 6,       // R_min = 6 * T (more flexible)
    PARTICLE_BOARD: 12, // R_min = 12 * T (brittle)
    HMR: 8,           // R_min = 8 * T
  };

  return thickness * multipliers[material];
}

// ============================================
// CORE KERF BENDING CALCULATIONS
// ============================================

/**
 * Calculate Arc Length
 *
 * FORMULA: L_arc = 2πR × (θ/360)
 *
 * @param radius Radius of arc (mm)
 * @param angleDegrees Angle of arc (degrees)
 * @returns Arc length in mm
 */
export function calculateArcLength(
  radius: number,
  angleDegrees: number
): number {
  return 2 * Math.PI * radius * (angleDegrees / 360);
}

/**
 * Calculate Arc Length Difference (ΔL)
 *
 * FORMULA: ΔL = L_outer - L_inner = 2πT × (θ/360)
 *
 * This is the key formula! The outer face of the panel
 * travels a longer arc than the inner face. The kerfs
 * must accommodate this difference.
 *
 * @param thickness Panel thickness T (mm)
 * @param angleDegrees Bend angle θ (degrees)
 * @returns Arc length difference ΔL (mm)
 */
export function calculateArcLengthDelta(
  thickness: number,
  angleDegrees: number
): number {
  // ΔL = 2πT × (θ/360)
  return 2 * Math.PI * thickness * (angleDegrees / 360);
}

/**
 * Calculate Number of Kerfs
 *
 * FORMULA: N = ΔL / K
 *
 * WHERE:
 * - ΔL = Arc length difference (what kerfs must accommodate)
 * - K = Kerf width (how much each kerf opens)
 *
 * @param deltaL Arc length difference (mm)
 * @param kerfWidth Width of each kerf (mm)
 * @returns Number of kerfs (rounded up)
 */
export function calculateKerfCount(
  deltaL: number,
  kerfWidth: number
): number {
  // N = ΔL / K (round up for safety)
  return Math.ceil(deltaL / kerfWidth);
}

/**
 * Calculate Kerf Spacing
 *
 * FORMULA: S = L_out / N
 *
 * Evenly distributes kerfs along the bend area
 *
 * @param outerArcLength Arc length on outer face (mm)
 * @param kerfCount Number of kerfs
 * @returns Center-to-center spacing (mm)
 */
export function calculateKerfSpacing(
  outerArcLength: number,
  kerfCount: number
): number {
  return outerArcLength / kerfCount;
}

/**
 * Alternative Kerf Spacing Formula (Quick Estimation)
 *
 * FORMULA: S ≈ (R × K) / T
 *
 * WHERE:
 * - S = Kerf spacing (center-to-center)
 * - R = Inner bend radius
 * - K = Kerf width (blade thickness)
 * - T = Panel thickness
 *
 * DERIVATION:
 * This simplified formula assumes that each kerf opens by
 * approximately K (kerf width) when bent. The spacing S
 * determines how many kerfs are in the bend zone.
 *
 * For a bend of angle θ, the outer face stretches by:
 * ΔL = 2πT × (θ/360)
 *
 * If we have N kerfs, each opens by K, so:
 * N × K = ΔL
 * N = ΔL / K
 *
 * Spacing S = Arc_length / N
 * For 90° bend: S ≈ (π/2 × R) / N = (π/2 × R × K) / (2πT × 0.25)
 * Simplifies to: S ≈ R × K / T
 *
 * NOTE: This is an approximation. Use calculateKerfBending()
 * for precise calculations.
 *
 * @param radius Inner bend radius R (mm)
 * @param kerfWidth Kerf/blade width K (mm)
 * @param thickness Panel thickness T (mm)
 * @returns Approximate spacing (mm)
 */
export function calculateKerfSpacingQuick(
  radius: number,
  kerfWidth: number,
  thickness: number
): number {
  // S ≈ (R × K) / T
  return (radius * kerfWidth) / thickness;
}

/**
 * Compare quick vs precise kerf calculations
 *
 * Useful for understanding the accuracy of the quick formula
 */
export function compareKerfCalculations(
  radius: number,
  thickness: number,
  kerfWidth: number,
  bendAngle: number
): {
  quickSpacing: number;
  preciseSpacing: number;
  deviation: number;      // Percentage difference
  useQuick: boolean;      // Whether quick formula is accurate enough
} {
  const quickSpacing = calculateKerfSpacingQuick(radius, kerfWidth, thickness);

  // Calculate precise spacing
  const deltaL = calculateArcLengthDelta(thickness, bendAngle);
  const kerfCount = calculateKerfCount(deltaL, kerfWidth);
  const outerArc = calculateArcLength(radius + thickness, bendAngle);
  const preciseSpacing = calculateKerfSpacing(outerArc, kerfCount);

  const deviation = Math.abs(quickSpacing - preciseSpacing) / preciseSpacing * 100;

  return {
    quickSpacing: Math.round(quickSpacing * 10) / 10,
    preciseSpacing: Math.round(preciseSpacing * 10) / 10,
    deviation: Math.round(deviation * 10) / 10,
    useQuick: deviation < 10, // Quick formula acceptable if <10% deviation
  };
}

/**
 * Calculate Kerf Depth
 *
 * FORMULA: D_kerf = T - W
 *
 * WHERE:
 * - T = Panel thickness
 * - W = Web thickness (remaining material)
 *
 * @param thickness Panel thickness (mm)
 * @param webThickness Web thickness (mm)
 * @returns Kerf depth (mm)
 */
export function calculateKerfDepth(
  thickness: number,
  webThickness: number
): number {
  return thickness - webThickness;
}

// ============================================
// MAIN KERF BENDING CALCULATOR
// ============================================

/**
 * Complete Kerf Bending Calculator
 *
 * Given panel dimensions and desired bend parameters,
 * calculates all kerf cutting specifications.
 *
 * @param params Kerf bending parameters
 * @returns Complete kerf bending result
 */
export function calculateKerfBending(params: KerfBendingParams): KerfBendingResult {
  const {
    panelThickness: T,
    panelWidth,
    panelLength,
    bendRadius: R,
    bendAngle: theta,
    material,
    profile,
    kerfWidth: K = 3.2,  // Default 3.2mm (1/8" bit)
  } = params;

  const warnings: string[] = [];

  // Step 1: Determine web thickness
  const webLimits = WEB_THICKNESS_LIMITS[material];
  let W = params.webThickness;

  if (!W) {
    // Auto-calculate: use recommended or ratio, whichever is larger
    W = Math.max(webLimits.recommended, T * webLimits.maxRatio);
  }

  // Validate web thickness
  if (W < webLimits.min) {
    warnings.push(`Web thickness ${W}mm below minimum ${webLimits.min}mm for ${material}`);
    W = webLimits.min;
  }

  // Step 2: Calculate kerf depth
  const D_kerf = calculateKerfDepth(T, W);

  if (D_kerf <= 0) {
    throw new Error(`Invalid kerf depth: ${D_kerf}mm. Panel too thin for web requirement.`);
  }

  // Step 3: Calculate arc lengths
  // Inner radius = R (the bend radius given)
  // Outer radius = R + T (outer face)
  const R_inner = R;
  const R_outer = R + T;

  const L_inner = calculateArcLength(R_inner, theta);
  const L_outer = calculateArcLength(R_outer, theta);
  const deltaL = calculateArcLengthDelta(T, theta);

  // Step 4: Calculate kerf count and spacing
  const N = calculateKerfCount(deltaL, K);
  const S = calculateKerfSpacing(L_outer, N);

  // Step 5: Validate bend radius
  const R_min = getMinimumBendRadius(T, material);
  const safetyFactor = R / R_min;

  if (safetyFactor < 1) {
    warnings.push(`Bend radius ${R}mm is below minimum ${R_min}mm for ${T}mm ${material}`);
  } else if (safetyFactor < 1.5) {
    warnings.push(`Bend radius ${R}mm is close to minimum ${R_min}mm. Consider larger radius.`);
  }

  // Step 6: Validate kerf spacing
  if (S < K * 1.5) {
    warnings.push(`Kerf spacing ${S.toFixed(1)}mm is very tight. May cause material failure.`);
  }

  // Step 7: Generate CNC parameters
  const cncParams: KerfCNCParams = {
    toolDiameter: K,
    cutDepth: D_kerf,
    feedRate: getFeedRate(material, K),
    spindleSpeed: getSpindleSpeed(material),
    passes: D_kerf > 12 ? Math.ceil(D_kerf / 6) : 1,
    startPosition: S / 2,           // First kerf at half-spacing from edge
    endPosition: L_outer - S / 2,   // Last kerf at half-spacing from edge
  };

  return {
    arcLengthOuter: Math.round(L_outer * 10) / 10,
    arcLengthInner: Math.round(L_inner * 10) / 10,
    arcLengthDelta: Math.round(deltaL * 10) / 10,
    kerfCount: N,
    kerfSpacing: Math.round(S * 10) / 10,
    kerfDepth: Math.round(D_kerf * 10) / 10,
    webThickness: W,
    minBendRadius: R_min,
    safetyFactor: Math.round(safetyFactor * 100) / 100,
    warnings,
    cncParams,
  };
}

// ============================================
// CNC PARAMETER HELPERS
// ============================================

/**
 * Get recommended feed rate for material
 */
function getFeedRate(material: KerfMaterial, toolDiameter: number): number {
  // Base feed rates in mm/min
  const baseRates: Record<KerfMaterial, number> = {
    MDF: 3000,
    PLYWOOD: 2500,
    PARTICLE_BOARD: 2000,
    HMR: 3000,
  };

  // Adjust for tool diameter (larger tool = slower)
  const toolFactor = toolDiameter > 6 ? 0.8 : 1;

  return baseRates[material] * toolFactor;
}

/**
 * Get recommended spindle speed for material
 */
function getSpindleSpeed(material: KerfMaterial): number {
  const speeds: Record<KerfMaterial, number> = {
    MDF: 18000,
    PLYWOOD: 16000,
    PARTICLE_BOARD: 14000,
    HMR: 18000,
  };

  return speeds[material];
}

// ============================================
// KERF PATTERN GENERATORS
// ============================================

export interface KerfLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  depth: number;
}

/**
 * Generate Straight Kerf Pattern
 *
 * Creates parallel kerf lines perpendicular to bend axis
 *
 * @param width Panel width (perpendicular to kerfs)
 * @param kerfCount Number of kerfs
 * @param kerfSpacing Spacing between kerfs
 * @param kerfDepth Depth of cut
 * @param startOffset Start position from edge
 * @returns Array of kerf lines
 */
export function generateStraightKerfPattern(
  width: number,
  kerfCount: number,
  kerfSpacing: number,
  kerfDepth: number,
  startOffset: number = 0
): KerfLine[] {
  const lines: KerfLine[] = [];

  for (let i = 0; i < kerfCount; i++) {
    const y = startOffset + (i + 0.5) * kerfSpacing;

    lines.push({
      x1: 0,
      y1: y,
      x2: width,
      y2: y,
      depth: kerfDepth,
    });
  }

  return lines;
}

/**
 * Generate Living Hinge Pattern
 *
 * Creates alternating offset kerfs for maximum flexibility
 * Used for very tight bends or compound curves
 *
 * @param width Panel width
 * @param length Panel length
 * @param kerfCount Number of kerf rows
 * @param kerfSpacing Row spacing
 * @param kerfDepth Depth of cut
 * @returns Array of kerf lines (alternating pattern)
 */
export function generateLivingHingePattern(
  width: number,
  length: number,
  kerfCount: number,
  kerfSpacing: number,
  kerfDepth: number
): KerfLine[] {
  const lines: KerfLine[] = [];
  const segmentLength = width / 3;  // 3 segments per row

  for (let i = 0; i < kerfCount; i++) {
    const y = (i + 0.5) * kerfSpacing;
    const isEvenRow = i % 2 === 0;

    // Create alternating segments
    if (isEvenRow) {
      // Cuts at edges, gap in middle
      lines.push({
        x1: 0,
        y1: y,
        x2: segmentLength,
        y2: y,
        depth: kerfDepth,
      });
      lines.push({
        x1: segmentLength * 2,
        y1: y,
        x2: width,
        y2: y,
        depth: kerfDepth,
      });
    } else {
      // Cut in middle, gaps at edges
      lines.push({
        x1: segmentLength,
        y1: y,
        x2: segmentLength * 2,
        y2: y,
        depth: kerfDepth,
      });
    }
  }

  return lines;
}

// ============================================
// REVERSE CALCULATIONS
// ============================================

/**
 * Calculate required kerf parameters for target bend
 *
 * Given desired bend radius and angle, determine if
 * it's achievable with given panel and what kerf
 * parameters are needed.
 *
 * @param thickness Panel thickness
 * @param material Material type
 * @param targetRadius Desired inner bend radius
 * @param targetAngle Desired bend angle
 * @returns Feasibility and required parameters
 */
export function calculateRequiredKerfParams(
  thickness: number,
  material: KerfMaterial,
  targetRadius: number,
  targetAngle: number
): {
  feasible: boolean;
  reason?: string;
  suggestedKerfWidth: number;
  suggestedWebThickness: number;
  minKerfCount: number;
} {
  const R_min = getMinimumBendRadius(thickness, material);

  if (targetRadius < R_min * 0.75) {
    return {
      feasible: false,
      reason: `Radius ${targetRadius}mm too tight for ${thickness}mm ${material}. Minimum: ${R_min}mm`,
      suggestedKerfWidth: 0,
      suggestedWebThickness: 0,
      minKerfCount: 0,
    };
  }

  const webLimits = WEB_THICKNESS_LIMITS[material];
  const suggestedWeb = Math.max(webLimits.recommended, thickness * webLimits.maxRatio);

  const deltaL = calculateArcLengthDelta(thickness, targetAngle);

  // Suggest kerf width based on available tools (3.2mm, 6mm, 9mm common)
  let suggestedKerfWidth = 3.2;
  if (deltaL > 50) suggestedKerfWidth = 6;
  if (deltaL > 100) suggestedKerfWidth = 9;

  const minKerfCount = calculateKerfCount(deltaL, suggestedKerfWidth);

  return {
    feasible: true,
    suggestedKerfWidth,
    suggestedWebThickness: suggestedWeb,
    minKerfCount,
  };
}

// ============================================
// EXPORT SUMMARY
// ============================================

/**
 * Generate human-readable kerf bending summary
 */
export function generateKerfBendingSummary(result: KerfBendingResult): string {
  const lines = [
    `=== KERF BENDING SPECIFICATION ===`,
    ``,
    `Arc Lengths:`,
    `  Outer face: ${result.arcLengthOuter} mm`,
    `  Inner face: ${result.arcLengthInner} mm`,
    `  Delta (ΔL): ${result.arcLengthDelta} mm`,
    ``,
    `Kerf Parameters:`,
    `  Number of kerfs: ${result.kerfCount}`,
    `  Kerf spacing: ${result.kerfSpacing} mm (center-to-center)`,
    `  Kerf depth: ${result.kerfDepth} mm`,
    `  Web thickness: ${result.webThickness} mm`,
    ``,
    `Safety:`,
    `  Min bend radius: ${result.minBendRadius} mm`,
    `  Safety factor: ${result.safetyFactor}x`,
    ``,
    `CNC Parameters:`,
    `  Tool diameter: ${result.cncParams.toolDiameter} mm`,
    `  Cut depth: ${result.cncParams.cutDepth} mm`,
    `  Feed rate: ${result.cncParams.feedRate} mm/min`,
    `  Spindle speed: ${result.cncParams.spindleSpeed} RPM`,
    `  Passes: ${result.cncParams.passes}`,
  ];

  if (result.warnings.length > 0) {
    lines.push(``, `Warnings:`);
    result.warnings.forEach(w => lines.push(`  ⚠️ ${w}`));
  }

  return lines.join('\n');
}

// ============================================
// MANUFACTURING NOTES & BEST PRACTICES
// ============================================

/**
 * Faceting Effect (Polygon Warning)
 *
 * PROBLEM: Kerf bending doesn't create a true curve, but a polygon
 * made of many small flat segments. If kerf spacing is too wide,
 * the "facets" become visible as ridges on the outer surface.
 *
 * VISUAL QUALITY GUIDELINES:
 * - S < 5mm: Near-invisible faceting (high quality)
 * - S = 5-10mm: Slight faceting, acceptable for painted surfaces
 * - S = 10-15mm: Noticeable faceting, cover with veneer/laminate
 * - S > 15mm: Severe faceting, not suitable for visible surfaces
 */
export interface FacetingAssessment {
  spacing: number;
  facetingLevel: 'NONE' | 'SLIGHT' | 'MODERATE' | 'SEVERE';
  recommendation: string;
  maxFacetHeight: number;  // mm - height of facet ridge
}

export function assessFaceting(
  kerfSpacing: number,
  bendRadius: number,
  thickness: number
): FacetingAssessment {
  // Calculate approximate facet height using geometry
  // Facet height = R * (1 - cos(θ/2)) where θ = S/R (angle per segment)
  const segmentAngle = kerfSpacing / (bendRadius + thickness);
  const maxFacetHeight = (bendRadius + thickness) * (1 - Math.cos(segmentAngle / 2));

  let facetingLevel: 'NONE' | 'SLIGHT' | 'MODERATE' | 'SEVERE';
  let recommendation: string;

  if (kerfSpacing <= 5) {
    facetingLevel = 'NONE';
    recommendation = 'High quality finish, suitable for all applications';
  } else if (kerfSpacing <= 10) {
    facetingLevel = 'SLIGHT';
    recommendation = 'Acceptable for painted surfaces, consider sanding before finish';
  } else if (kerfSpacing <= 15) {
    facetingLevel = 'MODERATE';
    recommendation = 'Apply flexible veneer or laminate to hide facets';
  } else {
    facetingLevel = 'SEVERE';
    recommendation = 'Not recommended for visible surfaces. Use more kerfs or consider steam bending';
  }

  return {
    spacing: kerfSpacing,
    facetingLevel,
    recommendation,
    maxFacetHeight: Math.round(maxFacetHeight * 100) / 100,
  };
}

/**
 * MDF Water Wetting Technique
 *
 * PRINCIPLE: Lightly moistening MDF before bending increases
 * temporary plasticity of fibers, reducing crack risk.
 *
 * CAUTION: Too much water causes swelling and delamination!
 *
 * PROCESS:
 * 1. Apply light mist of water to kerf side
 * 2. Wait 2-3 minutes for absorption
 * 3. Bend while still slightly damp
 * 4. Allow to dry completely before gluing
 */
export interface WettingRecommendation {
  recommended: boolean;
  waterApplication: 'NONE' | 'MIST' | 'DAMP_CLOTH';
  waitTime: number;  // minutes
  dryTime: number;   // minutes after bending
  notes: string[];
}

export function getWettingRecommendation(
  material: KerfMaterial,
  bendRadius: number,
  thickness: number
): WettingRecommendation {
  const minRadius = getMinimumBendRadius(thickness, material);
  const radiusRatio = bendRadius / minRadius;

  const notes: string[] = [];

  // Only recommend wetting for MDF and tight bends
  if (material !== 'MDF' && material !== 'HMR') {
    return {
      recommended: false,
      waterApplication: 'NONE',
      waitTime: 0,
      dryTime: 0,
      notes: ['Wetting not recommended for this material type'],
    };
  }

  if (radiusRatio > 1.5) {
    // Easy bend, no wetting needed
    return {
      recommended: false,
      waterApplication: 'NONE',
      waitTime: 0,
      dryTime: 0,
      notes: ['Bend radius comfortable, wetting not necessary'],
    };
  }

  // Tight bend - recommend wetting
  notes.push('Apply water to kerf side only, not face side');
  notes.push('Do not saturate - just light moisture');
  notes.push('Ensure complete drying before applying finish');

  if (material === 'HMR') {
    notes.push('HMR is moisture resistant - may need longer wait time');
  }

  return {
    recommended: true,
    waterApplication: radiusRatio < 1.2 ? 'DAMP_CLOTH' : 'MIST',
    waitTime: material === 'HMR' ? 5 : 3,
    dryTime: 60,
    notes,
  };
}

/**
 * Stress Concentration at Kerf Corners
 *
 * PROBLEM: Square-bottom kerfs (from flat end mills) create
 * stress concentration points at the corners, increasing
 * crack risk during bending.
 *
 * SOLUTIONS:
 * 1. Use ball-nose end mill (rounded kerf bottom)
 * 2. Use V-bit (tapered kerf)
 * 3. Increase web thickness
 * 4. Use slower bending action
 */
export type KerfToolProfile = 'FLAT' | 'BALL_NOSE' | 'V_BIT';

export interface StressConcentrationResult {
  toolProfile: KerfToolProfile;
  stressRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  stressMultiplier: number;  // 1.0 = baseline, higher = worse
  recommendations: string[];
}

export function assessStressConcentration(
  toolProfile: KerfToolProfile,
  webThickness: number,
  material: KerfMaterial
): StressConcentrationResult {
  const webLimits = WEB_THICKNESS_LIMITS[material];
  const webRatio = webThickness / webLimits.recommended;

  const recommendations: string[] = [];

  // Stress multiplier by tool profile
  const profileMultipliers: Record<KerfToolProfile, number> = {
    FLAT: 2.5,      // Sharp corners concentrate stress
    BALL_NOSE: 1.2, // Rounded bottom reduces stress
    V_BIT: 1.8,     // Tapered but still has corner
  };

  let multiplier = profileMultipliers[toolProfile];

  // Adjust for web thickness
  if (webRatio < 1) {
    multiplier *= 1.5;  // Thin web increases stress
    recommendations.push('Web thickness below recommended - increase if possible');
  }

  // Material adjustment
  if (material === 'PARTICLE_BOARD') {
    multiplier *= 1.3;
    recommendations.push('Particle board is brittle - consider different material');
  }

  // Risk assessment
  let stressRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  if (multiplier < 1.5) {
    stressRisk = 'LOW';
  } else if (multiplier < 2.5) {
    stressRisk = 'MEDIUM';
    if (toolProfile === 'FLAT') {
      recommendations.push('Consider using ball-nose end mill to reduce stress');
    }
  } else {
    stressRisk = 'HIGH';
    recommendations.push('High crack risk - use ball-nose tool and thicker web');
    recommendations.push('Apply bending force slowly and evenly');
  }

  return {
    toolProfile,
    stressRisk,
    stressMultiplier: Math.round(multiplier * 10) / 10,
    recommendations,
  };
}

/**
 * Glue-Filled Kerf Technique
 *
 * PURPOSE: After bending, the kerfs are open gaps that reduce
 * structural integrity. Filling with glue creates a solid,
 * permanent curved panel.
 *
 * PROCESS:
 * 1. Bend panel into form/jig
 * 2. Clamp securely
 * 3. Apply glue into kerfs (gravity-assisted)
 * 4. Allow full cure (24 hours for PVA, 4 hours for epoxy)
 * 5. Remove from form
 *
 * GLUE SELECTION:
 * - PVA (wood glue): Good for indoor use, flexible
 * - Epoxy: Maximum strength, waterproof, rigid
 * - Polyurethane: Expanding, fills gaps, waterproof
 */
export type GlueFillType = 'PVA' | 'EPOXY' | 'POLYURETHANE' | 'NONE';

export interface GlueFillRecommendation {
  recommended: boolean;
  glueType: GlueFillType;
  cureTime: number;       // hours in form
  strengthIncrease: number; // percentage
  notes: string[];
}

export function getGlueFillRecommendation(
  application: 'STRUCTURAL' | 'DECORATIVE' | 'FURNITURE' | 'ARCHITECTURAL',
  exposureToMoisture: boolean
): GlueFillRecommendation {
  const notes: string[] = [];

  // Decorative items may not need glue filling
  if (application === 'DECORATIVE') {
    return {
      recommended: false,
      glueType: 'NONE',
      cureTime: 0,
      strengthIncrease: 0,
      notes: ['Glue filling optional for decorative applications'],
    };
  }

  let glueType: GlueFillType;
  let cureTime: number;
  let strengthIncrease: number;

  if (application === 'STRUCTURAL' || exposureToMoisture) {
    glueType = 'EPOXY';
    cureTime = 24;
    strengthIncrease = 300;
    notes.push('Use structural epoxy for maximum strength');
    notes.push('Ensure complete coverage of all kerf surfaces');
  } else if (application === 'ARCHITECTURAL') {
    glueType = exposureToMoisture ? 'POLYURETHANE' : 'PVA';
    cureTime = exposureToMoisture ? 12 : 24;
    strengthIncrease = exposureToMoisture ? 200 : 150;
    notes.push('Polyurethane expands to fill gaps completely');
  } else {
    // FURNITURE
    glueType = 'PVA';
    cureTime = 24;
    strengthIncrease = 150;
    notes.push('Standard wood glue suitable for furniture');
    notes.push('Apply thin, even coat to kerf walls');
  }

  notes.push('Keep panel clamped in form during entire cure time');
  notes.push('Clean excess glue before it cures');

  return {
    recommended: true,
    glueType,
    cureTime,
    strengthIncrease,
    notes,
  };
}

/**
 * Vacuum Table Requirements for CNC Kerf Cutting
 *
 * PROBLEM: Material flatness is critical. Even 0.5mm warping
 * can cause web breakthrough if panel lifts toward the bit.
 *
 * SOLUTION: High-pressure vacuum hold ensures consistent Z-height
 */
export interface VacuumTableRequirements {
  minVacuumPressure: number;    // bar (negative)
  minZonesCovered: number;       // number of vacuum zones
  spoilboardFlatness: number;    // mm tolerance
  warningNotes: string[];
}

export function getVacuumTableRequirements(
  panelSize: { width: number; height: number },
  panelThickness: number,
  webThickness: number
): VacuumTableRequirements {
  const warningNotes: string[] = [];

  // Larger panels need more vacuum zones
  const panelArea = (panelSize.width / 1000) * (panelSize.height / 1000);
  const minZonesCovered = Math.max(1, Math.ceil(panelArea / 0.5)); // 1 zone per 0.5m²

  // Thinner web = tighter tolerance needed
  const toleranceMultiplier = 2 / webThickness; // 2mm web = 1x, 1mm web = 2x
  const spoilboardFlatness = 0.2 * toleranceMultiplier;

  // Pressure based on panel size
  let minVacuumPressure = 0.6; // bar (standard)
  if (panelArea > 1) {
    minVacuumPressure = 0.8;
    warningNotes.push('Large panel requires high-capacity vacuum pump');
  }

  // Warnings for thin web
  if (webThickness < 2) {
    warningNotes.push('Thin web requires exceptional flatness - verify spoilboard');
    warningNotes.push('Consider test cut to verify depth before full run');
  }

  // Material-specific notes
  warningNotes.push('Check panel for warping before loading');
  warningNotes.push('Ensure all vacuum zones are sealed around panel perimeter');

  return {
    minVacuumPressure,
    minZonesCovered,
    spoilboardFlatness: Math.round(spoilboardFlatness * 100) / 100,
    warningNotes,
  };
}
