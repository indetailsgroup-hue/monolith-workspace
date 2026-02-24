/**
 * ManufacturingCalculator - Manufacturing Intent Logic
 *
 * Based on North Star Manufacturing Document:
 * 1. Material Physics - Total Thickness calculation
 * 2. Anti-Collision Formula - Safe depth for internal parts
 * 3. Manufacturing Transformation - Finish to Cut size
 *
 * All dimensions in millimeters (mm)
 *
 * Manufacturing constants are sourced from manufacturing-constants.json
 * via the config loader. See src/core/config/loadManufacturingConfig.ts
 */

import {
  getDefaultBackConfig,
  getDefaultEdgeConfig,
  getDefaultPreMillConfig,
  getCompositions,
} from '../config/loadManufacturingConfig';

// ============================================
// TYPES
// ============================================

export interface MaterialComposition {
  coreThickness: number;      // T_core: e.g., 16mm, 18mm
  surfaceAThickness: number;  // T_surfaceA: e.g., 0.8mm HPL
  surfaceBThickness: number;  // T_surfaceB: e.g., 0.8mm HPL (or 0 if none)
  glueThickness: number;      // T_glue: 0.1mm for HPL, 0 for Melamine
}

export interface BackPanelConfig {
  construction: 'inset' | 'overlay';  // วิธีติดตั้งแผ่นหลัง
  thickness: number;                   // T_back: 6mm or 9mm
  grooveOffset: number;               // BackOffset: 20mm (distance from back edge to groove)
}

export interface EdgeConfig {
  top: number;     // T_edgeTop: 0, 0.5, 1, 2mm
  bottom: number;  // T_edgeBottom
  left: number;    // T_edgeLeft
  right: number;   // T_edgeRight
}

export interface PreMillConfig {
  top: number;     // P_millTop: typically 0.5mm
  bottom: number;
  left: number;
  right: number;
}

export interface PanelDimensions {
  finishWidth: number;
  finishHeight: number;
  cutWidth: number;
  cutHeight: number;
  realThickness: number;
}

// ============================================
// 1. MATERIAL PHYSICS - Total Thickness
// ============================================

/**
 * Calculate total thickness of composite panel
 * Formula: T_total = T_core + T_surfaceA + T_surfaceB + (2 × T_glue)
 */
export function calculateTotalThickness(material: MaterialComposition): number {
  const { coreThickness, surfaceAThickness, surfaceBThickness, glueThickness } = material;
  
  // Count how many surfaces have glue (non-zero thickness means it needs glue)
  const glueCount = (surfaceAThickness > 0 ? 1 : 0) + (surfaceBThickness > 0 ? 1 : 0);
  
  return coreThickness + surfaceAThickness + surfaceBThickness + (glueCount * glueThickness);
}

/**
 * Get common material compositions (sourced from manufacturing config)
 */
export const COMMON_COMPOSITIONS: Record<string, MaterialComposition> = getCompositions();

// ============================================
// 2. ANTI-COLLISION FORMULA - Safe Depth
// ============================================

/**
 * Calculate safe internal depth that won't collide with back panel
 * 
 * For INSET back: D_internal = D_cabinet - BackOffset - T_back - Gap_safety
 * For OVERLAY back: D_internal = D_cabinet - T_back - Gap_safety
 */
export function calculateInternalDepth(
  cabinetDepth: number,
  backConfig: BackPanelConfig,
  safetyGap: number = 2
): number {
  if (backConfig.construction === 'inset') {
    // Groove/Inset: Cabinet depth - groove offset - back thickness - safety gap
    return cabinetDepth - backConfig.grooveOffset - backConfig.thickness - safetyGap;
  } else {
    // Nail-on/Overlay: Cabinet depth - back thickness - safety gap
    return cabinetDepth - backConfig.thickness - safetyGap;
  }
}

/**
 * Calculate Divider dimensions (vertical partition)
 * Dividers span from bottom to top, with depth = safe internal depth
 */
export function calculateDividerDimensions(
  cabinetHeight: number,
  topPanelThickness: number,
  bottomPanelThickness: number,
  safeDepth: number,
  jointType: 'inset' | 'overlay' = 'inset'
): { finishWidth: number; finishHeight: number } {
  // Height depends on joint type
  let innerHeight: number;
  
  if (jointType === 'inset') {
    // Inset: Divider fits between top and bottom panels
    innerHeight = cabinetHeight - topPanelThickness - bottomPanelThickness;
  } else {
    // Overlay: Top/bottom cover the sides
    innerHeight = cabinetHeight - topPanelThickness - bottomPanelThickness;
  }
  
  return {
    finishWidth: safeDepth,     // Depth becomes width in manufacturing
    finishHeight: innerHeight,
  };
}

/**
 * Calculate Shelf dimensions (horizontal internal part)
 * Shelves fit inside the bay with clearance
 */
export function calculateShelfDimensions(
  bayWidth: number,
  safeDepth: number,
  frontSetback: number = 20,    // หลบหน้าบาน
  sideClearance: number = 1     // ข้างละ 1mm
): { finishWidth: number; finishHeight: number } {
  return {
    finishWidth: bayWidth - (sideClearance * 2),
    finishHeight: safeDepth - frontSetback,
  };
}

// ============================================
// 3. MANUFACTURING TRANSFORMATION - Cut Size
// ============================================

/**
 * Calculate Cut dimensions from Finish dimensions
 * 
 * Cut Width = Finish Width - (EdgeLeft + EdgeRight) + (PreMillLeft + PreMillRight)
 * Cut Height = Finish Height - (EdgeTop + EdgeBottom) + (PreMillTop + PreMillBottom)
 */
export function calculateCutDimensions(
  finishWidth: number,
  finishHeight: number,
  edges: EdgeConfig,
  preMill: PreMillConfig = { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 }
): { cutWidth: number; cutHeight: number } {
  // Subtract edge thickness, add pre-mill allowance
  const cutWidth = finishWidth 
    - edges.left 
    - edges.right 
    + (edges.left > 0 ? preMill.left : 0)
    + (edges.right > 0 ? preMill.right : 0);
    
  const cutHeight = finishHeight 
    - edges.top 
    - edges.bottom 
    + (edges.top > 0 ? preMill.top : 0)
    + (edges.bottom > 0 ? preMill.bottom : 0);
  
  return { cutWidth, cutHeight };
}

/**
 * Full panel calculation - from cabinet parameters to manufacturing output
 */
export function calculatePanelManufacturing(
  finishWidth: number,
  finishHeight: number,
  material: MaterialComposition,
  edges: EdgeConfig,
  preMill?: PreMillConfig
): PanelDimensions {
  const realThickness = calculateTotalThickness(material);
  const { cutWidth, cutHeight } = calculateCutDimensions(finishWidth, finishHeight, edges, preMill);
  
  return {
    finishWidth,
    finishHeight,
    cutWidth,
    cutHeight,
    realThickness,
  };
}

// ============================================
// 4. COMPLETE CABINET CALCULATION
// ============================================

export interface CabinetParams {
  width: number;
  height: number;
  depth: number;
  panelThickness: number;  // Main panel thickness (real)
  backConfig: BackPanelConfig;
  topJoint: 'inset' | 'overlay';
  bottomJoint: 'inset' | 'overlay';
}

export interface InternalPartResult {
  partName: string;
  finishWidth: number;
  finishHeight: number;
  cutWidth: number;
  cutHeight: number;
  formula: string;  // Human-readable formula
}

/**
 * Calculate all internal parts for a cabinet
 */
export function calculateInternalParts(
  params: CabinetParams,
  shelfCount: number,
  dividerCount: number,
  edges: EdgeConfig,
  frontSetback: number = 20
): InternalPartResult[] {
  const results: InternalPartResult[] = [];
  const { width, height, depth, panelThickness, backConfig, topJoint, bottomJoint } = params;
  
  // Calculate safe internal depth
  const safeDepth = calculateInternalDepth(depth, backConfig, 2);
  
  // Inner dimensions (space between sides, and between top/bottom)
  const innerWidth = width - (2 * panelThickness);
  const innerHeight = height - (topJoint === 'inset' ? panelThickness : 0) 
                            - (bottomJoint === 'inset' ? panelThickness : 0);
  
  // Calculate bay width (accounting for dividers)
  const bayCount = dividerCount + 1;
  const dividerThicknessTotal = dividerCount * panelThickness;
  const bayWidth = (innerWidth - dividerThicknessTotal) / bayCount;
  
  // Dividers
  for (let i = 0; i < dividerCount; i++) {
    const divider = calculateDividerDimensions(
      innerHeight,
      topJoint === 'inset' ? 0 : panelThickness,
      bottomJoint === 'inset' ? 0 : panelThickness,
      safeDepth,
      'inset'
    );
    
    const { cutWidth, cutHeight } = calculateCutDimensions(
      divider.finishWidth,
      divider.finishHeight,
      { top: edges.top, bottom: edges.bottom, left: 0, right: 0 }  // Only front edge
    );
    
    results.push({
      partName: `Divider ${i + 1}`,
      finishWidth: divider.finishWidth,
      finishHeight: divider.finishHeight,
      cutWidth,
      cutHeight,
      formula: `D(${depth}) - BackOffset(${backConfig.grooveOffset}) - BackThk(${backConfig.thickness}) - Gap(2)`,
    });
  }
  
  // Shelves (one per bay)
  for (let bay = 0; bay < bayCount; bay++) {
    for (let s = 0; s < shelfCount; s++) {
      const shelf = calculateShelfDimensions(bayWidth, safeDepth, frontSetback, 1);
      
      const { cutWidth, cutHeight } = calculateCutDimensions(
        shelf.finishWidth,
        shelf.finishHeight,
        { top: edges.top, bottom: 0, left: 0, right: 0 }  // Only front edge
      );
      
      results.push({
        partName: `Shelf ${bay * shelfCount + s + 1} (Bay ${bay + 1})`,
        finishWidth: shelf.finishWidth,
        finishHeight: shelf.finishHeight,
        cutWidth,
        cutHeight,
        formula: `D(${depth}) - Back(${backConfig.grooveOffset + backConfig.thickness + 2}) - Front(${frontSetback})`,
      });
    }
  }
  
  return results;
}

// ============================================
// 5. FORMULA STRING GENERATORS (for UI)
// ============================================

/**
 * Generate human-readable formula for shelf depth
 */
export function getShelfDepthFormula(
  cabinetDepth: number,
  backConfig: BackPanelConfig,
  frontSetback: number,
  safetyGap: number = 2
): string {
  if (backConfig.construction === 'inset') {
    return `D(${cabinetDepth}) - BackOffset(${backConfig.grooveOffset}) - BackThk(${backConfig.thickness}) - Safety(${safetyGap}) - Front(${frontSetback})`;
  }
  return `D(${cabinetDepth}) - BackThk(${backConfig.thickness}) - Safety(${safetyGap}) - Front(${frontSetback})`;
}

/**
 * Generate human-readable formula for cut width
 */
export function getCutWidthFormula(
  finishWidth: number,
  edgeLeft: number,
  edgeRight: number,
  preMill: number = 0.5
): string {
  const parts = [`Finish(${finishWidth})`];
  
  if (edgeLeft > 0) {
    parts.push(`- EdgeL(${edgeLeft})`);
    parts.push(`+ Mill(${preMill})`);
  }
  if (edgeRight > 0) {
    parts.push(`- EdgeR(${edgeRight})`);
    parts.push(`+ Mill(${preMill})`);
  }
  
  return parts.join(' ');
}

// ============================================
// 6. DEFAULTS (sourced from manufacturing config)
// ============================================

export const DEFAULT_BACK_CONFIG: BackPanelConfig = getDefaultBackConfig();

export const DEFAULT_EDGE_CONFIG: EdgeConfig = getDefaultEdgeConfig();

export const DEFAULT_PREMILL: PreMillConfig = getDefaultPreMillConfig();
