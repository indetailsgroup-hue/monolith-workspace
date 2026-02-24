/**
 * materialResolver.ts - Resolve Material Class from Packet/Panel Data
 *
 * Maps material identifiers and names to MaterialClass for policy lookup.
 * Uses pattern matching with fallback to UNKNOWN for safety.
 *
 * @version 1.0.0 - Phase D5-A
 */

import type { MaterialClass, PanelMaterialContext } from './materialTypes';

// ============================================
// MATERIAL NAME PATTERNS
// ============================================

/**
 * Pattern matching rules for material classification.
 * Order matters - first match wins.
 */
const MATERIAL_PATTERNS: Array<{
  pattern: RegExp;
  class: MaterialClass;
}> = [
  // HPL patterns (check first - most specific)
  { pattern: /\bhpl\b/i, class: 'HPL' },
  { pattern: /\blaminate\b/i, class: 'HPL' },
  { pattern: /\bformica\b/i, class: 'HPL' },
  { pattern: /\bwilsonart\b/i, class: 'HPL' },

  // HMR patterns
  { pattern: /\bhmr\b/i, class: 'HMR' },
  { pattern: /\bmoisture.?resist/i, class: 'HMR' },
  { pattern: /\bgreen.?mdf\b/i, class: 'HMR' },

  // Melamine patterns (before MDF - melamine is coated MDF/PB)
  { pattern: /\bmelamine\b/i, class: 'MELAMINE' },
  { pattern: /\bmel\b/i, class: 'MELAMINE' },
  { pattern: /\btfl\b/i, class: 'MELAMINE' }, // Thermally Fused Laminate
  { pattern: /\bcoated\b/i, class: 'MELAMINE' },

  // Plywood patterns
  { pattern: /\bplywood\b/i, class: 'PLYWOOD' },
  { pattern: /\bply\b/i, class: 'PLYWOOD' },
  { pattern: /\bbirch\b/i, class: 'PLYWOOD' },
  { pattern: /\bmaple\b/i, class: 'PLYWOOD' },
  { pattern: /\boak\b/i, class: 'PLYWOOD' },
  { pattern: /\bwalnut\b/i, class: 'PLYWOOD' },
  { pattern: /\bveneer\b/i, class: 'PLYWOOD' },

  // MDF patterns (last - most common fallback for engineered boards)
  { pattern: /\bmdf\b/i, class: 'MDF' },
  { pattern: /\bmedium.?density/i, class: 'MDF' },
  { pattern: /\bfiberboard\b/i, class: 'MDF' },
  { pattern: /\bparticleboard\b/i, class: 'MDF' }, // Treat PB similar to MDF
  { pattern: /\bpb\b/i, class: 'MDF' },
  { pattern: /\bchipboard\b/i, class: 'MDF' },
];

// ============================================
// RESOLVER FUNCTIONS
// ============================================

/**
 * Resolve material class from a material name string.
 *
 * Uses pattern matching against known material keywords.
 * Returns UNKNOWN if no pattern matches.
 *
 * @param materialName - Human-readable material name
 * @returns Resolved MaterialClass
 */
export function resolveMaterialClassFromName(
  materialName: string | undefined | null
): MaterialClass {
  if (!materialName) {
    return 'UNKNOWN';
  }

  const normalized = materialName.trim().toLowerCase();

  for (const { pattern, class: materialClass } of MATERIAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return materialClass;
    }
  }

  return 'UNKNOWN';
}

/**
 * Resolve material class for a panel from packet data.
 *
 * @param panelId - Panel identifier
 * @param materialId - Optional material ID from spec
 * @param materialName - Optional material name from spec
 * @returns PanelMaterialContext with resolved class
 */
export function resolveMaterialClassForPanel(
  panelId: string,
  materialId?: string,
  materialName?: string
): PanelMaterialContext {
  // Try to resolve from name first
  let materialClass = resolveMaterialClassFromName(materialName);

  // If still unknown and materialId looks like a known class, use it
  if (materialClass === 'UNKNOWN' && materialId) {
    const idUpper = materialId.toUpperCase();
    if (['MDF', 'MELAMINE', 'PLYWOOD', 'HPL', 'HMR'].includes(idUpper)) {
      materialClass = idUpper as MaterialClass;
    }
  }

  return {
    panelId,
    materialId,
    materialName,
    materialClass,
  };
}

/**
 * Batch resolve material classes for multiple panels.
 *
 * @param panels - Array of panel data with material info
 * @returns Map of panelId → PanelMaterialContext
 */
export function resolveMaterialClassForPanels(
  panels: Array<{
    panelId: string;
    materialId?: string;
    materialName?: string;
  }>
): Map<string, PanelMaterialContext> {
  const result = new Map<string, PanelMaterialContext>();

  for (const panel of panels) {
    const context = resolveMaterialClassForPanel(
      panel.panelId,
      panel.materialId,
      panel.materialName
    );
    result.set(panel.panelId, context);
  }

  return result;
}

// ============================================
// HELPERS
// ============================================

/**
 * Get all supported material patterns for documentation.
 */
export function getSupportedMaterialPatterns(): Array<{
  class: MaterialClass;
  examples: string[];
}> {
  const byClass = new Map<MaterialClass, string[]>();

  for (const { pattern, class: materialClass } of MATERIAL_PATTERNS) {
    const examples = byClass.get(materialClass) || [];
    // Extract keyword from pattern for example
    const keyword = pattern.source.replace(/\\b|\\s|\?/g, '').replace(/\./g, ' ');
    examples.push(keyword);
    byClass.set(materialClass, examples);
  }

  return Array.from(byClass.entries()).map(([materialClass, examples]) => ({
    class: materialClass,
    examples,
  }));
}
