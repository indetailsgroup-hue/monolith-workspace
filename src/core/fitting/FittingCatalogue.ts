/**
 * FittingCatalogue - Hardware/Fitting Types & Safety Ranking
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Implements A.9: Fitting Catalogue / Safety & Ranking
 * - Safety validation before Gate export
 * - BOM sync with factory codes
 * 
 * RANKING PRIORITY:
 * 1. Compatible + Brand Tier + Factory Preference
 * 2. Compatible + Budget
 * 3. Compatible but Low Confidence
 * 4. Incompatible (hidden or flagged)
 */

// ============================================
// TYPES
// ============================================

export type FittingCategory = 
  | 'HINGE'
  | 'SLIDE'
  | 'LIFT'
  | 'SHELF_SUPPORT'
  | 'CONNECTOR'
  | 'HANDLE'
  | 'LEG'
  | 'OTHER';

export type BrandTier = 'PREMIUM' | 'MID' | 'BUDGET' | 'UNKNOWN';

export type SafetyStatus = 'SAFE' | 'WARN' | 'UNSAFE' | 'UNKNOWN';

export interface ThicknessRange {
  min: number;  // mm
  max: number;  // mm
}

export interface DoorSizeRange {
  minWidth: number;   // mm
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

export interface DrillingPattern {
  id: string;
  name: string;
  system: 'SYSTEM_32' | 'CUSTOM' | 'MINIFIX' | 'CONFIRMAT';
  holes: {
    x: number;
    y: number;
    diameter: number;
    depth: number;
  }[];
}

export interface FittingSpec {
  // Identification
  id: string;
  factoryCode: string;
  name: string;
  vendor: string;
  category: FittingCategory;
  
  // Brand & Ranking
  brandTier: BrandTier;
  reliabilityScore: number;  // 0-100
  
  // Compatibility
  thicknessRange: ThicknessRange;
  doorSizeRange?: DoorSizeRange;
  weightCapacity?: number;  // kg
  
  // Drilling
  drillingPatternId: string;
  drillingPattern?: DrillingPattern;
  
  // Metadata
  description?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
}

export interface FittingAssignment {
  id: string;
  fittingId: string;
  factoryCode: string;
  
  // Target
  cabinetId: string;
  panelId: string;
  
  // Position
  side: 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM' | 'CENTER';
  position: [number, number, number];  // Local position on panel
  
  // Safety
  safetyStatus: SafetyStatus;
  overrideFlag: boolean;
  overrideReason?: string;
  
  // Validation results
  validationErrors: string[];
}

export interface CompatibilityResult {
  isCompatible: boolean;
  safetyStatus: SafetyStatus;
  errors: string[];
  warnings: string[];
}

// ============================================
// FITTING CATALOGUE DATA
// ============================================

/**
 * Sample Fitting Catalogue
 * In production, this would be fetched from server
 */
export const FITTING_CATALOGUE: FittingSpec[] = [
  // ========== HINGES (BLUM) ==========
  {
    id: 'hinge-clip-top-110',
    factoryCode: 'BLUM-71B3550',
    name: 'CLIP top 110°',
    vendor: 'Blum',
    category: 'HINGE',
    brandTier: 'PREMIUM',
    reliabilityScore: 95,
    thicknessRange: { min: 16, max: 19 },
    doorSizeRange: {
      minWidth: 300,
      maxWidth: 600,
      minHeight: 300,
      maxHeight: 1200,
    },
    weightCapacity: 8,
    drillingPatternId: 'BLUM_CLIP_35MM',
    description: 'Soft-close hinge, 110° opening',
  },
  {
    id: 'hinge-clip-top-155',
    factoryCode: 'BLUM-79B9550',
    name: 'CLIP top 155° Wide Angle',
    vendor: 'Blum',
    category: 'HINGE',
    brandTier: 'PREMIUM',
    reliabilityScore: 93,
    thicknessRange: { min: 16, max: 19 },
    doorSizeRange: {
      minWidth: 300,
      maxWidth: 500,
      minHeight: 300,
      maxHeight: 900,
    },
    weightCapacity: 6,
    drillingPatternId: 'BLUM_CLIP_35MM',
    description: 'Wide angle hinge for corner cabinets',
  },
  {
    id: 'hinge-heavy-duty',
    factoryCode: 'BLUM-71T6550',
    name: 'CLIP top BLUMOTION Heavy Duty',
    vendor: 'Blum',
    category: 'HINGE',
    brandTier: 'PREMIUM',
    reliabilityScore: 98,
    thicknessRange: { min: 18, max: 25 },
    doorSizeRange: {
      minWidth: 400,
      maxWidth: 900,
      minHeight: 400,
      maxHeight: 2400,
    },
    weightCapacity: 15,
    drillingPatternId: 'BLUM_CLIP_35MM',
    description: 'Heavy duty hinge for large doors',
  },
  
  // ========== HINGES (BUDGET) ==========
  {
    id: 'hinge-generic-110',
    factoryCode: 'GEN-H110',
    name: 'Generic 110° Hinge',
    vendor: 'Generic',
    category: 'HINGE',
    brandTier: 'BUDGET',
    reliabilityScore: 60,
    thicknessRange: { min: 16, max: 18 },
    doorSizeRange: {
      minWidth: 250,
      maxWidth: 450,
      minHeight: 250,
      maxHeight: 800,
    },
    weightCapacity: 5,
    drillingPatternId: 'GENERIC_35MM',
    description: 'Economy hinge, basic soft-close',
  },
  
  // ========== DRAWER SLIDES (BLUM LEGRABOX) ==========
  {
    id: 'slide-legrabox-30kg',
    factoryCode: 'BLUM-770C3002S',
    name: 'LEGRABOX pure 30kg',
    vendor: 'Blum',
    category: 'SLIDE',
    brandTier: 'PREMIUM',
    reliabilityScore: 97,
    thicknessRange: { min: 16, max: 19 },
    weightCapacity: 30,
    drillingPatternId: 'BLUM_LEGRABOX',
    description: 'Premium drawer system, 30kg capacity',
  },
  {
    id: 'slide-legrabox-50kg',
    factoryCode: 'BLUM-770C5002S',
    name: 'LEGRABOX pure 50kg',
    vendor: 'Blum',
    category: 'SLIDE',
    brandTier: 'PREMIUM',
    reliabilityScore: 97,
    thicknessRange: { min: 16, max: 19 },
    weightCapacity: 50,
    drillingPatternId: 'BLUM_LEGRABOX',
    description: 'Premium drawer system, 50kg capacity',
  },
  {
    id: 'slide-legrabox-70kg',
    factoryCode: 'BLUM-770C7002S',
    name: 'LEGRABOX pure 70kg',
    vendor: 'Blum',
    category: 'SLIDE',
    brandTier: 'PREMIUM',
    reliabilityScore: 96,
    thicknessRange: { min: 18, max: 19 },
    weightCapacity: 70,
    drillingPatternId: 'BLUM_LEGRABOX_HD',
    description: 'Heavy duty drawer system',
  },
  
  // ========== LIFT SYSTEMS (BLUM AVENTOS) ==========
  {
    id: 'lift-aventos-hk-xs',
    factoryCode: 'BLUM-20K2C00',
    name: 'AVENTOS HK-XS',
    vendor: 'Blum',
    category: 'LIFT',
    brandTier: 'PREMIUM',
    reliabilityScore: 94,
    thicknessRange: { min: 16, max: 19 },
    doorSizeRange: {
      minWidth: 200,
      maxWidth: 600,
      minHeight: 200,
      maxHeight: 400,
    },
    weightCapacity: 5.25,
    drillingPatternId: 'BLUM_AVENTOS_HK',
    description: 'Compact lift system for small cabinets',
  },
  {
    id: 'lift-aventos-hf',
    factoryCode: 'BLUM-20F2200',
    name: 'AVENTOS HF Bi-Fold',
    vendor: 'Blum',
    category: 'LIFT',
    brandTier: 'PREMIUM',
    reliabilityScore: 92,
    thicknessRange: { min: 16, max: 19 },
    doorSizeRange: {
      minWidth: 300,
      maxWidth: 1800,
      minHeight: 300,
      maxHeight: 600,
    },
    weightCapacity: 13,
    drillingPatternId: 'BLUM_AVENTOS_HF',
    description: 'Bi-fold lift system',
  },
  
  // ========== SHELF SUPPORTS ==========
  {
    id: 'shelf-support-15kg',
    factoryCode: 'BLUM-282.3100',
    name: 'Shelf Support 15kg',
    vendor: 'Blum',
    category: 'SHELF_SUPPORT',
    brandTier: 'PREMIUM',
    reliabilityScore: 90,
    thicknessRange: { min: 16, max: 19 },
    weightCapacity: 15,
    drillingPatternId: 'SYSTEM_32_5MM',
    description: 'Standard shelf support pin',
  },
  {
    id: 'shelf-support-50kg',
    factoryCode: 'BLUM-282.3500',
    name: 'Heavy Duty Shelf Support 50kg',
    vendor: 'Blum',
    category: 'SHELF_SUPPORT',
    brandTier: 'PREMIUM',
    reliabilityScore: 92,
    thicknessRange: { min: 18, max: 25 },
    weightCapacity: 50,
    drillingPatternId: 'SYSTEM_32_8MM',
    description: 'Heavy duty shelf support',
  },
];

// ============================================
// DRILLING PATTERNS
// ============================================

export const DRILLING_PATTERNS: Record<string, DrillingPattern> = {
  'BLUM_CLIP_35MM': {
    id: 'BLUM_CLIP_35MM',
    name: 'Blum CLIP 35mm Cup',
    system: 'SYSTEM_32',
    holes: [
      { x: 0, y: 0, diameter: 35, depth: 13 },      // Cup hole
      { x: -24, y: 0, diameter: 8, depth: 11 },     // Mounting hole 1
      { x: 24, y: 0, diameter: 8, depth: 11 },      // Mounting hole 2
    ],
  },
  'BLUM_LEGRABOX': {
    id: 'BLUM_LEGRABOX',
    name: 'Blum LEGRABOX Side Mount',
    system: 'SYSTEM_32',
    holes: [
      { x: 0, y: 37, diameter: 5, depth: 12 },
      { x: 0, y: 69, diameter: 5, depth: 12 },
      { x: 0, y: 101, diameter: 5, depth: 12 },
    ],
  },
  'SYSTEM_32_5MM': {
    id: 'SYSTEM_32_5MM',
    name: 'System 32 - 5mm Pin',
    system: 'SYSTEM_32',
    holes: [
      { x: 0, y: 0, diameter: 5, depth: 12 },
    ],
  },
};

// ============================================
// COMPATIBILITY CHECKER
// ============================================

export interface PanelContext {
  thickness: number;          // mm
  width: number;              // mm
  height: number;             // mm
  material: string;
  cabinetType: 'BASE' | 'WALL' | 'TALL' | 'DRAWER';
  panelType: 'DOOR' | 'DRAWER_FRONT' | 'SIDE' | 'TOP' | 'BOTTOM';
}

/**
 * Check if a fitting is compatible with given panel context
 */
export function checkFittingCompatibility(
  fitting: FittingSpec,
  context: PanelContext
): CompatibilityResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // 1. Check thickness range
  if (context.thickness < fitting.thicknessRange.min) {
    errors.push(`Panel thickness ${context.thickness}mm is below minimum ${fitting.thicknessRange.min}mm`);
  }
  if (context.thickness > fitting.thicknessRange.max) {
    errors.push(`Panel thickness ${context.thickness}mm exceeds maximum ${fitting.thicknessRange.max}mm`);
  }
  
  // 2. Check door size (for hinges/lifts)
  if (fitting.doorSizeRange && (context.panelType === 'DOOR' || context.panelType === 'DRAWER_FRONT')) {
    const { minWidth, maxWidth, minHeight, maxHeight } = fitting.doorSizeRange;
    
    if (context.width < minWidth) {
      errors.push(`Panel width ${context.width}mm is below minimum ${minWidth}mm`);
    }
    if (context.width > maxWidth) {
      errors.push(`Panel width ${context.width}mm exceeds maximum ${maxWidth}mm`);
    }
    if (context.height < minHeight) {
      errors.push(`Panel height ${context.height}mm is below minimum ${minHeight}mm`);
    }
    if (context.height > maxHeight) {
      errors.push(`Panel height ${context.height}mm exceeds maximum ${maxHeight}mm`);
    }
  }
  
  // 3. Check weight capacity (estimate based on material)
  if (fitting.weightCapacity) {
    const estimatedWeight = estimatePanelWeight(context);
    if (estimatedWeight > fitting.weightCapacity) {
      errors.push(`Estimated panel weight ${estimatedWeight.toFixed(1)}kg exceeds capacity ${fitting.weightCapacity}kg`);
    } else if (estimatedWeight > fitting.weightCapacity * 0.8) {
      warnings.push(`Panel weight ${estimatedWeight.toFixed(1)}kg is near capacity limit ${fitting.weightCapacity}kg`);
    }
  }
  
  // 4. Check drilling pattern compatibility
  const pattern = DRILLING_PATTERNS[fitting.drillingPatternId];
  if (!pattern) {
    warnings.push(`Drilling pattern ${fitting.drillingPatternId} not in machine library`);
  }
  
  // 5. Determine safety status
  let safetyStatus: SafetyStatus;
  if (errors.length > 0) {
    safetyStatus = 'UNSAFE';
  } else if (warnings.length > 0) {
    safetyStatus = 'WARN';
  } else {
    safetyStatus = 'SAFE';
  }
  
  return {
    isCompatible: errors.length === 0,
    safetyStatus,
    errors,
    warnings,
  };
}

/**
 * Estimate panel weight based on dimensions and material
 */
function estimatePanelWeight(context: PanelContext): number {
  // Material densities (kg/m³)
  const densities: Record<string, number> = {
    'MDF': 750,
    'HDF': 850,
    'PLYWOOD': 600,
    'PARTICLE_BOARD': 650,
    'SOLID_WOOD': 700,
    'GLASS': 2500,
    'STONE': 2700,
    'DEFAULT': 700,
  };
  
  const density = densities[context.material] || densities['DEFAULT'];
  
  // Volume in m³
  const volumeM3 = (context.width / 1000) * (context.height / 1000) * (context.thickness / 1000);
  
  return volumeM3 * density;
}

// ============================================
// RANKING FUNCTIONS
// ============================================

export interface RankedFitting {
  fitting: FittingSpec;
  rank: number;
  compatibility: CompatibilityResult;
  score: number;
}

/**
 * Rank fittings for a given panel context
 * 
 * Ranking Priority:
 * 1. Compatible + Premium Brand + High Reliability
 * 2. Compatible + Mid Brand
 * 3. Compatible + Budget
 * 4. Incompatible (at bottom)
 */
export function rankFittingsForContext(
  fittings: FittingSpec[],
  context: PanelContext,
  category?: FittingCategory
): RankedFitting[] {
  // Filter by category if specified
  let filtered = category 
    ? fittings.filter(f => f.category === category)
    : fittings;
  
  // Calculate compatibility and score for each
  const ranked = filtered.map(fitting => {
    const compatibility = checkFittingCompatibility(fitting, context);
    
    // Calculate composite score
    let score = 0;
    
    // Compatibility is primary (0-50 points)
    if (compatibility.isCompatible) {
      score += 50;
    }
    
    // Brand tier (0-30 points)
    switch (fitting.brandTier) {
      case 'PREMIUM': score += 30; break;
      case 'MID': score += 20; break;
      case 'BUDGET': score += 10; break;
      default: score += 5; break;
    }
    
    // Reliability score (0-20 points)
    score += (fitting.reliabilityScore / 100) * 20;
    
    // Penalty for warnings
    score -= compatibility.warnings.length * 5;
    
    // Penalty for errors
    score -= compatibility.errors.length * 20;
    
    return {
      fitting,
      rank: 0,
      compatibility,
      score,
    };
  });
  
  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score);
  
  // Assign ranks
  ranked.forEach((item, index) => {
    item.rank = index + 1;
  });
  
  return ranked;
}

/**
 * Get recommended fittings (top 3 safe options)
 */
export function getRecommendedFittings(
  context: PanelContext,
  category: FittingCategory
): RankedFitting[] {
  const ranked = rankFittingsForContext(FITTING_CATALOGUE, context, category);
  
  // Return top 3 safe/warn options
  return ranked
    .filter(r => r.compatibility.safetyStatus !== 'UNSAFE')
    .slice(0, 3);
}
