/**
 * Material Thickness Calculator - Single Source of Truth
 *
 * ARCHITECTURE:
 * This module is the ONLY place where panel thickness is calculated.
 * All consumers (Store, 3D, Manufacturing, Export) MUST use these functions.
 *
 * FORMULA:
 * T_real = T_core + T_surfaceA + T_surfaceB + (T_glue × 2)
 *
 * @version 1.0.0
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * Glue layer thickness per side (mm)
 * Standard adhesive layer in lamination process
 */
export const GLUE_THICKNESS_MM = 0.1;

/**
 * Whether to include glue in thickness calculations
 * Set to true for manufacturing accuracy, false for simplified display
 */
export const INCLUDE_GLUE_IN_THICKNESS = false; // Match existing behavior (no glue in display)

// ============================================
// TYPES
// ============================================

/**
 * Minimal panel interface for thickness calculation
 * Accepts any object with these fields (duck typing)
 */
export interface PanelThicknessInput {
  coreMaterialId: string;
  faces: {
    faceA: string | null;
    faceB: string | null;
  };
}

/**
 * Core material spec with thickness
 */
export interface CoreMaterialSpec {
  id: string;
  thickness: number;
  [key: string]: unknown;
}

/**
 * Surface material spec with thickness
 */
export interface SurfaceMaterialSpec {
  id: string;
  thickness: number;
  [key: string]: unknown;
}

// ============================================
// MATERIAL REGISTRIES
// Import from store to avoid duplication
// ============================================

// We need to import the material catalogs from the store
// To avoid circular dependency, we use a registry pattern

let _coreMaterials: Record<string, CoreMaterialSpec> | null = null;
let _surfaceMaterials: Record<string, SurfaceMaterialSpec> | null = null;

/**
 * Initialize material registries
 * MUST be called once at app startup with the material catalogs
 */
export function initMaterialRegistries(
  coreMaterials: Record<string, CoreMaterialSpec>,
  surfaceMaterials: Record<string, SurfaceMaterialSpec>
): void {
  _coreMaterials = coreMaterials;
  _surfaceMaterials = surfaceMaterials;
}

/**
 * Get core material by ID
 * Falls back to safe default if not found
 */
export function getCoreMaterial(id: string): CoreMaterialSpec | null {
  if (!_coreMaterials) {
    console.warn('[materialThickness] Core materials not initialized');
    return null;
  }
  return _coreMaterials[id] ?? null;
}

/**
 * Get surface material by ID
 * Falls back to safe default if not found
 */
export function getSurfaceMaterial(id: string): SurfaceMaterialSpec | null {
  if (!_surfaceMaterials) {
    console.warn('[materialThickness] Surface materials not initialized');
    return null;
  }
  return _surfaceMaterials[id] ?? null;
}

/**
 * Get core thickness by ID
 * Returns 0 if not found (safe default)
 */
export function getCoreThickness(coreId: string): number {
  const material = getCoreMaterial(coreId);
  return material?.thickness ?? 0;
}

/**
 * Get surface thickness by ID
 * Returns 0 if not found or null (safe default)
 */
export function getSurfaceThickness(surfaceId: string | null): number {
  if (!surfaceId) return 0;
  const material = getSurfaceMaterial(surfaceId);
  return material?.thickness ?? 0;
}

// ============================================
// CORE THICKNESS CALCULATORS
// ============================================

/**
 * Calculate total panel thickness from materials
 *
 * This is the SINGLE SOURCE OF TRUTH for thickness calculation.
 * All other code paths MUST use this function.
 *
 * @param panel - Panel with coreMaterialId and faces
 * @param defaultSurfaceId - Default surface ID for fallback when face is null
 * @param options - Calculation options
 * @returns Total thickness in mm
 */
export function computePanelTotalThickness(
  panel: PanelThicknessInput,
  defaultSurfaceId: string = 'surf-mel-white',
  options: { includeGlue?: boolean } = {}
): number {
  const includeGlue = options.includeGlue ?? INCLUDE_GLUE_IN_THICKNESS;

  // Get core thickness
  const coreThickness = getCoreThickness(panel.coreMaterialId);

  // Get surface thicknesses (use default if face is null)
  const faceAId = panel.faces.faceA ?? defaultSurfaceId;
  const faceBId = panel.faces.faceB ?? defaultSurfaceId;

  const surfaceAThickness = getSurfaceThickness(faceAId);
  const surfaceBThickness = getSurfaceThickness(faceBId);

  // Calculate total
  let total = coreThickness + surfaceAThickness + surfaceBThickness;

  if (includeGlue) {
    total += GLUE_THICKNESS_MM * 2; // Glue on both sides
  }

  return total;
}

/**
 * Alias for back panel - same calculation, semantic clarity
 */
export const computeBackPanelTotalThickness = computePanelTotalThickness;

/**
 * Calculate back depth reduction for overlay mode
 *
 * @param structure - Cabinet structure with backPanelConstruction
 * @param backPanel - The back panel (if exists)
 * @param defaultSurfaceId - Default surface ID
 * @returns Depth reduction in mm (0 for inset mode)
 */
export function computeBackDepthReduction(
  structure: { hasBackPanel: boolean; backPanelConstruction: 'inset' | 'overlay' },
  backPanel: PanelThicknessInput | null,
  defaultSurfaceId: string = 'surf-mel-white'
): number {
  // No back panel = no reduction
  if (!structure.hasBackPanel || !backPanel) {
    return 0;
  }

  // Inset mode = no reduction (back fits in groove)
  if (structure.backPanelConstruction === 'inset') {
    return 0;
  }

  // Overlay mode = reduce by total back panel thickness
  return computePanelTotalThickness(backPanel, defaultSurfaceId);
}

// ============================================
// VALIDATION HELPERS
// ============================================

/**
 * Validate that thickness is within reasonable bounds
 * Useful for catching configuration errors
 */
export function isValidPanelThickness(thickness: number): boolean {
  // Panel thickness should be between 3mm (thin backing) and 50mm (thick countertop)
  return thickness >= 3 && thickness <= 50;
}

/**
 * Get a breakdown of thickness components for debugging
 */
export function getThicknessBreakdown(
  panel: PanelThicknessInput,
  defaultSurfaceId: string = 'surf-mel-white'
): {
  core: number;
  faceA: number;
  faceB: number;
  glue: number;
  total: number;
  totalWithGlue: number;
} {
  const coreThickness = getCoreThickness(panel.coreMaterialId);
  const faceAId = panel.faces.faceA ?? defaultSurfaceId;
  const faceBId = panel.faces.faceB ?? defaultSurfaceId;
  const faceAThickness = getSurfaceThickness(faceAId);
  const faceBThickness = getSurfaceThickness(faceBId);
  const glueTotal = GLUE_THICKNESS_MM * 2;

  const total = coreThickness + faceAThickness + faceBThickness;
  const totalWithGlue = total + glueTotal;

  return {
    core: coreThickness,
    faceA: faceAThickness,
    faceB: faceBThickness,
    glue: glueTotal,
    total,
    totalWithGlue,
  };
}
