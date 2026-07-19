/**
 * panelFormulas.ts — the two truth-layer panel formulas, as a dependency-free leaf.
 *
 * WHY THIS FILE EXISTS (it is not gratuitous layering):
 * `calculateRealThickness` used to live in `types/Cabinet.ts`. The finished-counter-
 * height derivation in `catalog/CabinetTaxonomy.ts` must derive the worktop slab
 * thickness from the REAL material stack rather than hardcoding it, so it needs this
 * formula — while `types/Cabinet.ts` must in turn read the derived plinth height for
 * `DEFAULT_DIMENSIONS.toeKickHeight`. Leaving the formula in Cabinet.ts makes that a
 * runtime import cycle (Cabinet -> CabinetTaxonomy -> Cabinet) whose correctness would
 * rest on function-declaration hoisting — i.e. it would appear to work until someone
 * converted a `function` to a `const`.
 *
 * Extracting the formula to a leaf breaks the cycle without duplicating it, which the
 * project's truth-derivation rule requires ("one formula, one place"). `types/Cabinet.ts`
 * re-exports both symbols, so every existing importer is untouched.
 *
 * Keep this file free of ALL imports. Its leaf status is load-bearing.
 */

/**
 * Calculate real thickness including surface materials and glue
 *
 * Formula: T_real = T_core + T_surfA + T_surfB + (T_glue × 2)
 *
 * Note: Glue is applied on BOTH sides of core (surfA-core and core-surfB)
 * So we multiply glue thickness by 2
 *
 * @param coreThickness - Core material thickness (mm)
 * @param surfaceA - Surface A thickness (mm) - typically front face
 * @param surfaceB - Surface B thickness (mm) - typically back face
 * @param glueThicknessPerLayer - Glue layer thickness PER SIDE (mm), default 0.1
 * @returns Real thickness in mm
 *
 * @example
 * // HMR 18mm + HPL 0.8mm both sides + glue 0.1mm per layer
 * calculateRealThickness(18, 0.8, 0.8, 0.1)
 * // Returns: 18 + 0.8 + 0.8 + (0.1 × 2) = 19.8mm
 */
export function calculateRealThickness(
  coreThickness: number,
  surfaceA: number,
  surfaceB: number,
  glueThicknessPerLayer: number = 0.1
): number {
  // Glue on both interfaces: surfA↔core and core↔surfB
  const totalGlue = glueThicknessPerLayer * 2;
  return coreThickness + surfaceA + surfaceB + totalGlue;
}

/**
 * Calculate cut size from finish size
 *
 * Formula: CutSize = FinishSize - (E1 + E2) + preMill_per_edged_side
 *
 * Pre-milling is ONLY applied to sides that have edge banding!
 * This is because the edge bander needs material to trim before applying tape.
 *
 * @param finishSize - Finish dimension after edge banding (mm)
 * @param edge1 - Edge thickness side 1 (mm), 0 if no edge
 * @param edge2 - Edge thickness side 2 (mm), 0 if no edge
 * @param _preMillPerSide - Pre-milling allowance PER SIDE that has edge (mm), default 0.5
 * @returns Cut size in mm
 *
 * @example
 * // Panel 600mm finish, 1mm edge both sides, 0.5mm preMill
 * calculateCutSize(600, 1, 1, 0.5)
 * // Returns: 600 - (1+1) = 598mm
 *
 * @example
 * // Panel 600mm finish, 1mm edge LEFT only
 * calculateCutSize(600, 1, 0, 0.5)
 * // Returns: 600 - (1+0) = 599mm
 */
export function calculateCutSize(
  finishSize: number,
  edge1: number,
  edge2: number,
  _preMillPerSide: number = 0.5 // Kept for API compatibility but not used
): number {
  // Cut Size = Finish Size - Edge Thicknesses
  // This is the panel size AFTER pre-milling, ready for edge banding
  // Pre-milling is a machine operation, not added to cut dimensions
  return finishSize - (edge1 + edge2);
}
