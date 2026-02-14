/**
 * Composite Material Thickness Calculation Module
 *
 * @module gate/compute/composite
 * @version 0.1.0
 *
 * Calculates the real (actual) thickness of composite panel materials.
 *
 * ## Formula
 * ```
 * T_real = T_core + T_surfaceA + T_surfaceB
 * ```
 *
 * ## Material Structure
 * Panel materials are typically composite with:
 * - Core: MDF, particleboard, plywood (main structural layer)
 * - Surface A: Melamine, veneer, laminate (visible face)
 * - Surface B: Backer, balance sheet, or matching face
 *
 * @example
 * // 16mm MDF with 0.2mm melamine both sides
 * // T_real = 16 + 0.2 + 0.2 = 16.4mm
 */

import type { MaterialSpec } from '../types';

/**
 * Calculates the total thickness of a composite panel material.
 *
 * This is critical for:
 * - Drill depth safety calculations (prevent drilling through)
 * - Hardware fitting calculations (cam/dowel placement)
 * - Assembly tolerance calculations
 *
 * @param m - Material specification containing layer thicknesses
 * @returns Total thickness in mm (core + surface A + surface B)
 *
 * @example
 * const material: MaterialSpec = {
 *   coreThicknessMm: 16,      // 16mm particleboard
 *   surfaceAThicknessMm: 0.2, // Melamine face
 *   surfaceBThicknessMm: 0.2, // Melamine back
 * };
 * const thickness = compositeThicknessMm(material); // 16.4mm
 *
 * @example
 * // 18mm MDF with 0.8mm veneer face, 0.1mm backer
 * const veneerMaterial: MaterialSpec = {
 *   coreThicknessMm: 18,
 *   surfaceAThicknessMm: 0.8,
 *   surfaceBThicknessMm: 0.1,
 * };
 * const t = compositeThicknessMm(veneerMaterial); // 18.9mm
 *
 * @see {@link ../rules/rule_drillDepthSafety} Uses this for max drill depth
 */
export function compositeThicknessMm(m: MaterialSpec): number {
  return m.coreThicknessMm + m.surfaceAThicknessMm + m.surfaceBThicknessMm;
}
