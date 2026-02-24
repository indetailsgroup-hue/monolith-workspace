/**
 * StructuralCheck - Structural Integrity Validation System
 * 
 * ARCHITECTURE (North Star v4.0):
 * - Part of Liability Shield (Business Engine)
 * - Validates panel weight vs hardware load rating
 * - Prevents safety issues before production
 * 
 * CONCEPT:
 * "Beauty must not kill" - every design must be structurally safe
 * System auto-checks weight against hardware capabilities
 * 
 * All dimensions in millimeters (mm), weight in kilograms (kg)
 */

import { MaterialCategory, MATERIAL_BEHAVIORS, calculatePanelWeight } from './ToleranceEngine';

// ============================================
// HARDWARE TYPES & RATINGS
// ============================================

export type HardwareType = 
  | 'HINGE_STANDARD'       // Standard door hinge
  | 'HINGE_HEAVY_DUTY'     // Heavy duty hinge
  | 'AVENTOS_HK'           // Blum Aventos HK (lift system)
  | 'AVENTOS_HK_XS'        // Blum Aventos HK-XS (heavy)
  | 'AVENTOS_HL'           // Blum Aventos HL (lift up)
  | 'AVENTOS_HF'           // Blum Aventos HF (bi-fold)
  | 'AVENTOS_HS'           // Blum Aventos HS (up & over)
  | 'DRAWER_SLIDE_30KG'    // Standard drawer slide
  | 'DRAWER_SLIDE_50KG'    // Heavy duty slide
  | 'DRAWER_SLIDE_80KG'    // Legrabox 80kg
  | 'SHELF_SUPPORT_15KG'   // Standard shelf pin
  | 'SHELF_SUPPORT_50KG'   // Heavy duty bracket
  | 'PULL_OUT_LARDER';     // Pull out larder unit

export interface HardwareSpec {
  type: HardwareType;
  name: string;
  brand: string;
  
  // Load ratings
  maxWeightKg: number;        // Maximum panel/drawer weight
  maxWidthMM: number;         // Maximum panel width
  maxHeightMM: number;        // Maximum panel height
  
  // Installation requirements
  minQuantity: number;        // Minimum units needed
  quantityPerMeter?: number;  // Units per meter (for slides)
  
  // Cost for upselling
  costPerUnit: number;        // THB
  
  // Notes
  notes: string;
}

// ============================================
// HARDWARE DATABASE
// ============================================

export const HARDWARE_SPECS: Record<HardwareType, HardwareSpec> = {
  HINGE_STANDARD: {
    type: 'HINGE_STANDARD',
    name: 'Standard Clip-On Hinge',
    brand: 'Blum CLIP top',
    maxWeightKg: 8,
    maxWidthMM: 600,
    maxHeightMM: 1200,
    minQuantity: 2,
    costPerUnit: 150,
    notes: 'Suitable for standard MDF/Plywood doors',
  },
  
  HINGE_HEAVY_DUTY: {
    type: 'HINGE_HEAVY_DUTY',
    name: 'Heavy Duty Hinge',
    brand: 'Blum CLIP top BLUMOTION',
    maxWeightKg: 15,
    maxWidthMM: 900,
    maxHeightMM: 2400,
    minQuantity: 3,
    costPerUnit: 350,
    notes: 'For heavy doors, solid wood, or oversized panels',
  },
  
  AVENTOS_HK: {
    type: 'AVENTOS_HK',
    name: 'AVENTOS HK Stay Lift',
    brand: 'Blum',
    maxWeightKg: 7.5,
    maxWidthMM: 1800,
    maxHeightMM: 600,
    minQuantity: 1,
    costPerUnit: 2500,
    notes: 'Lift-up door system for wall cabinets',
  },
  
  AVENTOS_HK_XS: {
    type: 'AVENTOS_HK_XS',
    name: 'AVENTOS HK-XS Small Stay Lift',
    brand: 'Blum',
    maxWeightKg: 5.25,
    maxWidthMM: 1200,
    maxHeightMM: 400,
    minQuantity: 1,
    costPerUnit: 1800,
    notes: 'Compact lift system for small cabinets',
  },
  
  AVENTOS_HL: {
    type: 'AVENTOS_HL',
    name: 'AVENTOS HL Lift Up',
    brand: 'Blum',
    maxWeightKg: 11.5,
    maxWidthMM: 1800,
    maxHeightMM: 700,
    minQuantity: 1,
    costPerUnit: 3200,
    notes: 'Parallel lift for larger cabinets',
  },
  
  AVENTOS_HF: {
    type: 'AVENTOS_HF',
    name: 'AVENTOS HF Bi-Fold',
    brand: 'Blum',
    maxWeightKg: 13,
    maxWidthMM: 1800,
    maxHeightMM: 1040,
    minQuantity: 1,
    costPerUnit: 3800,
    notes: 'Bi-fold lift system, door folds up',
  },
  
  AVENTOS_HS: {
    type: 'AVENTOS_HS',
    name: 'AVENTOS HS Up & Over',
    brand: 'Blum',
    maxWeightKg: 14.75,
    maxWidthMM: 1800,
    maxHeightMM: 800,
    minQuantity: 1,
    costPerUnit: 4500,
    notes: 'Up and over lift for tall cabinets',
  },
  
  DRAWER_SLIDE_30KG: {
    type: 'DRAWER_SLIDE_30KG',
    name: 'TANDEMBOX 30kg',
    brand: 'Blum',
    maxWeightKg: 30,
    maxWidthMM: 1200,
    maxHeightMM: 200,
    minQuantity: 2,
    costPerUnit: 800,
    notes: 'Standard drawer for light to medium loads',
  },
  
  DRAWER_SLIDE_50KG: {
    type: 'DRAWER_SLIDE_50KG',
    name: 'TANDEMBOX 50kg',
    brand: 'Blum',
    maxWeightKg: 50,
    maxWidthMM: 1200,
    maxHeightMM: 200,
    minQuantity: 2,
    costPerUnit: 1200,
    notes: 'Heavy duty for pots & pans drawers',
  },
  
  DRAWER_SLIDE_80KG: {
    type: 'DRAWER_SLIDE_80KG',
    name: 'LEGRABOX 80kg',
    brand: 'Blum',
    maxWeightKg: 80,
    maxWidthMM: 1200,
    maxHeightMM: 200,
    minQuantity: 2,
    costPerUnit: 2000,
    notes: 'Premium drawer system for heavy loads',
  },
  
  SHELF_SUPPORT_15KG: {
    type: 'SHELF_SUPPORT_15KG',
    name: 'Standard Shelf Pin',
    brand: 'Generic',
    maxWeightKg: 15,
    maxWidthMM: 1200,
    maxHeightMM: 25,
    minQuantity: 4,
    costPerUnit: 5,
    notes: '4 pins per shelf, distributed load',
  },
  
  SHELF_SUPPORT_50KG: {
    type: 'SHELF_SUPPORT_50KG',
    name: 'Heavy Duty Shelf Bracket',
    brand: 'Häfele',
    maxWeightKg: 50,
    maxWidthMM: 1200,
    maxHeightMM: 40,
    minQuantity: 4,
    costPerUnit: 45,
    notes: 'For heavy shelves or long spans',
  },
  
  PULL_OUT_LARDER: {
    type: 'PULL_OUT_LARDER',
    name: 'Pull-Out Larder Unit',
    brand: 'Blum SPACE TOWER',
    maxWeightKg: 120,
    maxWidthMM: 600,
    maxHeightMM: 2400,
    minQuantity: 1,
    costPerUnit: 15000,
    notes: 'Full extension pull-out pantry',
  },
};

// ============================================
// VALIDATION RESULTS
// ============================================

export type ValidationSeverity = 'OK' | 'WARNING' | 'ERROR' | 'CRITICAL';

export interface ValidationResult {
  severity: ValidationSeverity;
  passed: boolean;
  
  // Panel info
  panelWeight: number;         // kg
  
  // Hardware info
  hardware: HardwareSpec;
  requiredQuantity: number;
  
  // Capacity analysis
  loadPercentage: number;      // % of max capacity used
  
  // Messages
  messages: string[];
  
  // Recommendations
  recommendations: HardwareType[];
  
  // Cost impact
  hardwareCost: number;        // THB
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

/**
 * Validate panel weight against hardware capacity
 * Core function for Liability Shield
 */
export function validatePanelHardware(
  panelLengthMM: number,
  panelWidthMM: number,
  panelThicknessMM: number,
  material: MaterialCategory,
  hardware: HardwareType
): ValidationResult {
  const { weightKg } = calculatePanelWeight(
    panelLengthMM,
    panelWidthMM,
    panelThicknessMM,
    material
  );
  
  const spec = HARDWARE_SPECS[hardware];
  const messages: string[] = [];
  const recommendations: HardwareType[] = [];
  
  // Calculate load percentage
  const loadPercentage = (weightKg / spec.maxWeightKg) * 100;
  
  // Calculate required quantity (for hinges, more needed for heavier doors)
  let requiredQuantity = spec.minQuantity;
  if (weightKg > spec.maxWeightKg * 0.7) {
    requiredQuantity = Math.ceil(spec.minQuantity * 1.5);
  }
  
  // Check dimensions
  const widthOK = panelWidthMM <= spec.maxWidthMM;
  const heightOK = panelLengthMM <= spec.maxHeightMM;
  const weightOK = weightKg <= spec.maxWeightKg;
  
  // Determine severity
  let severity: ValidationSeverity = 'OK';
  let passed = true;
  
  if (!weightOK) {
    severity = 'CRITICAL';
    passed = false;
    messages.push(`🚨 CRITICAL: Panel weight ${weightKg.toFixed(1)}kg exceeds hardware limit ${spec.maxWeightKg}kg`);
    
    // Find suitable alternatives
    const alternatives = findSuitableHardware(weightKg, panelWidthMM, panelLengthMM);
    recommendations.push(...alternatives);
    
    if (alternatives.length > 0) {
      messages.push(`💡 Recommended upgrade: ${HARDWARE_SPECS[alternatives[0]].name}`);
    }
  } else if (loadPercentage > 90) {
    severity = 'WARNING';
    messages.push(`⚠️ WARNING: Load at ${loadPercentage.toFixed(0)}% capacity - near limit`);
    messages.push('Consider upgrading hardware for safety margin');
  } else if (loadPercentage > 70) {
    severity = 'WARNING';
    messages.push(`Load at ${loadPercentage.toFixed(0)}% capacity - acceptable but monitor`);
  } else {
    messages.push(`✅ Load at ${loadPercentage.toFixed(0)}% capacity - OK`);
  }
  
  if (!widthOK) {
    severity = severity === 'CRITICAL' ? 'CRITICAL' : 'ERROR';
    passed = false;
    messages.push(`Panel width ${panelWidthMM}mm exceeds max ${spec.maxWidthMM}mm`);
  }
  
  if (!heightOK) {
    severity = severity === 'CRITICAL' ? 'CRITICAL' : 'ERROR';
    passed = false;
    messages.push(`Panel height ${panelLengthMM}mm exceeds max ${spec.maxHeightMM}mm`);
  }
  
  // Material-specific warnings
  if (material === 'STONE_NATURAL' || material === 'STONE_ENGINEERED') {
    messages.push('⚠️ Stone panel: ensure proper substrate support');
    if (weightKg > 10) {
      messages.push('Consider mechanical fixing in addition to adhesive');
    }
  }
  
  if (material === 'GLASS') {
    messages.push('⚠️ Glass panel: use appropriate glass-rated hardware');
  }
  
  return {
    severity,
    passed,
    panelWeight: weightKg,
    hardware: spec,
    requiredQuantity,
    loadPercentage,
    messages,
    recommendations,
    hardwareCost: spec.costPerUnit * requiredQuantity,
  };
}

/**
 * Find suitable hardware options for given weight/dimensions
 */
export function findSuitableHardware(
  weightKg: number,
  widthMM: number,
  heightMM: number
): HardwareType[] {
  const suitable: HardwareType[] = [];
  
  for (const [type, spec] of Object.entries(HARDWARE_SPECS)) {
    if (
      spec.maxWeightKg >= weightKg * 1.2 && // 20% safety margin
      spec.maxWidthMM >= widthMM &&
      spec.maxHeightMM >= heightMM
    ) {
      suitable.push(type as HardwareType);
    }
  }
  
  // Sort by cost (cheapest first that still works)
  suitable.sort((a, b) => HARDWARE_SPECS[a].costPerUnit - HARDWARE_SPECS[b].costPerUnit);
  
  return suitable;
}

/**
 * Quick check for door panel
 */
export function checkDoorPanel(
  widthMM: number,
  heightMM: number,
  thicknessMM: number,
  material: MaterialCategory = 'WOOD_PANEL'
): ValidationResult {
  // Auto-select hinge type based on dimensions
  const isLarge = widthMM > 600 || heightMM > 1200;
  const hardware: HardwareType = isLarge ? 'HINGE_HEAVY_DUTY' : 'HINGE_STANDARD';
  
  return validatePanelHardware(heightMM, widthMM, thicknessMM, material, hardware);
}

/**
 * Quick check for lift-up panel (AVENTOS)
 */
export function checkLiftUpPanel(
  widthMM: number,
  heightMM: number,
  thicknessMM: number,
  material: MaterialCategory = 'WOOD_PANEL'
): ValidationResult {
  // Auto-select AVENTOS type based on dimensions
  let hardware: HardwareType = 'AVENTOS_HK';
  
  if (heightMM <= 400 && widthMM <= 1200) {
    hardware = 'AVENTOS_HK_XS';
  } else if (heightMM > 700) {
    hardware = 'AVENTOS_HF';  // Bi-fold for tall
  } else if (heightMM > 600) {
    hardware = 'AVENTOS_HL';  // Parallel lift
  }
  
  return validatePanelHardware(heightMM, widthMM, thicknessMM, material, hardware);
}

/**
 * Quick check for drawer
 */
export function checkDrawer(
  widthMM: number,
  depthMM: number,
  heightMM: number,
  expectedLoadKg: number = 20
): ValidationResult {
  // Select slide based on expected load
  let hardware: HardwareType = 'DRAWER_SLIDE_30KG';
  
  if (expectedLoadKg > 50) {
    hardware = 'DRAWER_SLIDE_80KG';
  } else if (expectedLoadKg > 30) {
    hardware = 'DRAWER_SLIDE_50KG';
  }
  
  // For drawer, we check the slide capacity against expected load
  const spec = HARDWARE_SPECS[hardware];
  const loadPercentage = (expectedLoadKg / spec.maxWeightKg) * 100;
  
  const messages: string[] = [];
  let severity: ValidationSeverity = 'OK';
  let passed = true;
  
  if (expectedLoadKg > spec.maxWeightKg) {
    severity = 'CRITICAL';
    passed = false;
    messages.push(`🚨 Expected load ${expectedLoadKg}kg exceeds slide capacity ${spec.maxWeightKg}kg`);
  } else {
    messages.push(`✅ Drawer load OK: ${loadPercentage.toFixed(0)}% of ${spec.maxWeightKg}kg capacity`);
  }
  
  if (widthMM > spec.maxWidthMM) {
    severity = 'ERROR';
    passed = false;
    messages.push(`Drawer width ${widthMM}mm exceeds max ${spec.maxWidthMM}mm`);
  }
  
  return {
    severity,
    passed,
    panelWeight: expectedLoadKg,
    hardware: spec,
    requiredQuantity: 2,  // Always pair
    loadPercentage,
    messages,
    recommendations: [],
    hardwareCost: spec.costPerUnit * 2,
  };
}
