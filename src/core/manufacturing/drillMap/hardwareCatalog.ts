/**
 * Hardware Catalog Lookup — Häfele Minifix® / Maxifix® System
 *
 * Maps drill point characteristics (purpose + dimensions + config)
 * to hardware product names and catalog numbers.
 *
 * Data source: Häfele catalog FF 3.8–3.24 (Ixconnect Cabinet Connectors)
 *              and FC 11.64 (Connectors and Shelf Supports — Dowels)
 *
 * COMPLETE DATA — extracted from official Häfele PDF catalogs:
 *   - FF 3.9  : Minifix® 12 with/without rim housing
 *   - FF 3.9  : Minifix® 15 with rim housing
 *   - FF 3.10 : Minifix® 15 without rim housing (zinc alloy + plastic)
 *   - FF 3.11 : C100 Spreading bolt
 *   - FF 3.12 : S200 Connecting bolt (special thread + M6)
 *   - FF 3.13 : M100, M200 Connecting bolt
 *   - FF 3.14 : M200 M6 thread
 *   - FF 3.15 : S300 Connecting bolt (special thread + M6)
 *   - FF 3.16 : S100 Connecting bolt (Ø3/5/8mm)
 *   - FF 3.17 : S100 M4 thread
 *   - FF 3.19 : Capped bolts, double-ended bolts
 *   - FF 3.22 : Maxifix® housing
 *   - FF 3.23 : Maxifix S35 bolt
 *   - FC 11.64: Wood Dowels (Fluted) + Pre-Glued Multi-Grooved
 */

import type { DrillPurpose, MinifixConfig } from './types';

// ============================================
// CATALOG ENTRY TYPE
// ============================================

export interface HardwareCatalogEntry {
  hardwareName: string;
  catalogNo: string;
}

// ============================================
// MINIFIX HOUSING CATALOG
// ============================================

/** Minifix® Connector Housing — keyed by camDia + woodThickness + variant */
interface HousingKey {
  camDia: number;       // 12 or 15 mm
  woodThickness: number;
  withRim: boolean;
}

// Häfele FF 3.9–3.10: Minifix® Connector Housing
// Uses nickel plated as default finish
const HOUSING_CATALOG: Array<{ match: HousingKey; entry: HardwareCatalogEntry }> = [
  // ── Minifix® 12 with rim (FF 3.9) ──
  // From 12mm, drilling depth 9.5+0.2, Dim.A 6mm
  { match: { camDia: 12, woodThickness: 12, withRim: true }, entry: { hardwareName: 'Minifix® 12 with rim', catalogNo: '262.18.620' } },

  // ── Minifix® 12 without rim (FF 3.9) ──
  // From 12mm, drilling depth 9.5+0.2, Dim.A 6mm
  { match: { camDia: 12, woodThickness: 12, withRim: false }, entry: { hardwareName: 'Minifix® 12 without rim', catalogNo: '262.17.620' } },

  // ── Minifix® 15 with rim (FF 3.9) — nickel plated ──
  { match: { camDia: 15, woodThickness: 12, withRim: true }, entry: { hardwareName: 'Minifix® 15 with rim', catalogNo: '262.25.570' } },
  { match: { camDia: 15, woodThickness: 16, withRim: true }, entry: { hardwareName: 'Minifix® 15 with rim', catalogNo: '262.25.533' } },
  { match: { camDia: 15, woodThickness: 19, withRim: true }, entry: { hardwareName: 'Minifix® 15 with rim', catalogNo: '262.25.535' } },
  { match: { camDia: 15, woodThickness: 23, withRim: true }, entry: { hardwareName: 'Minifix® 15 with rim', catalogNo: '262.25.535' } },
  { match: { camDia: 15, woodThickness: 29, withRim: true }, entry: { hardwareName: 'Minifix® 15 with rim', catalogNo: '262.25.538' } },
  { match: { camDia: 15, woodThickness: 34, withRim: true }, entry: { hardwareName: 'Minifix® 15 with rim', catalogNo: '262.25.581' } },

  // ── Minifix® 15 without rim (FF 3.10) — nickel plated ──
  { match: { camDia: 15, woodThickness: 12, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.570' } },
  { match: { camDia: 15, woodThickness: 13, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.531' } },
  { match: { camDia: 15, woodThickness: 15, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.532' } },
  { match: { camDia: 15, woodThickness: 16, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.533' } },
  { match: { camDia: 15, woodThickness: 18, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.534' } },
  { match: { camDia: 15, woodThickness: 19, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.535' } },
  { match: { camDia: 15, woodThickness: 22, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.263' } },
  { match: { camDia: 15, woodThickness: 23, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.536' } },
  { match: { camDia: 15, woodThickness: 26, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.537' } },
  { match: { camDia: 15, woodThickness: 29, withRim: false }, entry: { hardwareName: 'Minifix® 15 without rim', catalogNo: '262.26.538' } },

  // ── Minifix® 15 without rim, plastic (FF 3.10) ──
  // From 16mm, drilling depth 12.5, Dim.A 8mm
  { match: { camDia: 15, woodThickness: 16, withRim: false }, entry: { hardwareName: 'Minifix® 15 plastic', catalogNo: '262.16.941' } },
];

// ============================================
// CONNECTING BOLT CATALOG
// ============================================

/** Bolt model → catalog entries keyed by shaftDia + threadLength + drillingDistanceB */
interface BoltKey {
  model: string;        // 'S200' | 'S300' | 'C100' | 'M100' | 'M200' | 'S100'
  shaftDia: number;     // mm (thread hole diameter: 3, 5, 8, or 10)
  threadLength: number; // mm
  drillingDistanceB: number; // 24 or 34 mm
}

const BOLT_CATALOG: Array<{ match: BoltKey; entry: HardwareCatalogEntry }> = [
  // ══════════════════════════════════════════
  // S200 Connecting bolt (FF 3.12)
  // Ø5mm drill hole, Ø6.5mm bolt head, special thread
  // ══════════════════════════════════════════
  { match: { model: 'S200', shaftDia: 5, threadLength: 8.5, drillingDistanceB: 24 }, entry: { hardwareName: 'S200 Connecting bolt', catalogNo: '262.27.680' } },
  { match: { model: 'S200', shaftDia: 5, threadLength: 8.5, drillingDistanceB: 34 }, entry: { hardwareName: 'S200 Connecting bolt', catalogNo: '262.28.689' } },
  { match: { model: 'S200', shaftDia: 5, threadLength: 11, drillingDistanceB: 24 }, entry: { hardwareName: 'S200 Connecting bolt', catalogNo: '262.27.670' } },
  { match: { model: 'S200', shaftDia: 5, threadLength: 11, drillingDistanceB: 34 }, entry: { hardwareName: 'S200 Connecting bolt', catalogNo: '262.28.670' } },
  // S200 with M6 thread (FF 3.12)
  { match: { model: 'S200', shaftDia: 5, threadLength: 7.5, drillingDistanceB: 34 }, entry: { hardwareName: 'S200 M6 bolt', catalogNo: '262.28.690' } },

  // ══════════════════════════════════════════
  // C100 Spreading bolt (FF 3.11)
  // Ø5mm drill hole — spreading sleeve, no tools required
  // ══════════════════════════════════════════
  { match: { model: 'C100', shaftDia: 5, threadLength: 11.8, drillingDistanceB: 34 }, entry: { hardwareName: 'C100 Spreading bolt', catalogNo: '262.09.320' } },
  // C100 — Ø8mm drill hole
  { match: { model: 'C100', shaftDia: 8, threadLength: 11.5, drillingDistanceB: 24 }, entry: { hardwareName: 'C100 Spreading bolt', catalogNo: '262.09.202' } },
  { match: { model: 'C100', shaftDia: 8, threadLength: 11.5, drillingDistanceB: 34 }, entry: { hardwareName: 'C100 Spreading bolt', catalogNo: '262.09.302' } },
  // C100 — Ø10mm drill hole
  { match: { model: 'C100', shaftDia: 10, threadLength: 11.5, drillingDistanceB: 24 }, entry: { hardwareName: 'C100 Spreading bolt', catalogNo: '262.09.213' } },
  { match: { model: 'C100', shaftDia: 10, threadLength: 11.5, drillingDistanceB: 34 }, entry: { hardwareName: 'C100 Spreading bolt', catalogNo: '262.09.313' } },

  // ══════════════════════════════════════════
  // M100 Connecting bolt (FF 3.13)
  // Ø5mm drill hole, Ø6.5mm bolt head, special thread
  // ══════════════════════════════════════════
  { match: { model: 'M100', shaftDia: 5, threadLength: 8.5, drillingDistanceB: 24 }, entry: { hardwareName: 'M100 Connecting bolt', catalogNo: '262.27.611' } },
  { match: { model: 'M100', shaftDia: 5, threadLength: 8.5, drillingDistanceB: 34 }, entry: { hardwareName: 'M100 Connecting bolt', catalogNo: '262.28.611' } },

  // ══════════════════════════════════════════
  // M200 Connecting bolt (FF 3.13)
  // Ø5mm drill hole, Ø7mm bolt head, special thread
  // ══════════════════════════════════════════
  { match: { model: 'M200', shaftDia: 5, threadLength: 11, drillingDistanceB: 24 }, entry: { hardwareName: 'M200 Connecting bolt', catalogNo: '262.27.627' } },
  { match: { model: 'M200', shaftDia: 5, threadLength: 11, drillingDistanceB: 34 }, entry: { hardwareName: 'M200 Connecting bolt', catalogNo: '262.28.624' } },
  // M200 with M6 thread (FF 3.14) — Ø7mm bolt head
  { match: { model: 'M200', shaftDia: 5, threadLength: 7.5, drillingDistanceB: 24 }, entry: { hardwareName: 'M200 M6 bolt', catalogNo: '262.27.047' } },
  { match: { model: 'M200', shaftDia: 5, threadLength: 7.5, drillingDistanceB: 34 }, entry: { hardwareName: 'M200 M6 bolt', catalogNo: '262.28.044' } },
  // M200 M6 longer thread (FF 3.14)
  { match: { model: 'M200', shaftDia: 5, threadLength: 12, drillingDistanceB: 24 }, entry: { hardwareName: 'M200 M6 bolt', catalogNo: '262.27.941' } },
  { match: { model: 'M200', shaftDia: 5, threadLength: 12, drillingDistanceB: 34 }, entry: { hardwareName: 'M200 M6 bolt', catalogNo: '262.28.941' } },

  // ══════════════════════════════════════════
  // S300 Connecting bolt (FF 3.15)
  // Ø5mm drill hole, Ø6.5mm bolt head, special thread — increased breaking torque
  // ══════════════════════════════════════════
  { match: { model: 'S300', shaftDia: 5, threadLength: 11, drillingDistanceB: 24 }, entry: { hardwareName: 'S300 Connecting bolt', catalogNo: '262.27.462' } },
  { match: { model: 'S300', shaftDia: 5, threadLength: 11, drillingDistanceB: 34 }, entry: { hardwareName: 'S300 Connecting bolt', catalogNo: '262.28.462' } },
  // S300 with M6 thread (FF 3.15)
  { match: { model: 'S300', shaftDia: 5, threadLength: 8, drillingDistanceB: 24 }, entry: { hardwareName: 'S300 M6 bolt', catalogNo: '262.27.471' } },
  { match: { model: 'S300', shaftDia: 5, threadLength: 8, drillingDistanceB: 34 }, entry: { hardwareName: 'S300 M6 bolt', catalogNo: '262.28.471' } },

  // ══════════════════════════════════════════
  // S100 Connecting bolt (FF 3.16)
  // Ø3mm drill hole, Ø7mm bolt head, Ø8mm bolt hole
  // ══════════════════════════════════════════
  { match: { model: 'S100', shaftDia: 3, threadLength: 10.5, drillingDistanceB: 24 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.27.911' } },
  { match: { model: 'S100', shaftDia: 3, threadLength: 12, drillingDistanceB: 24 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.27.912' } },
  { match: { model: 'S100', shaftDia: 3, threadLength: 12, drillingDistanceB: 34 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.28.919' } },

  // S100 — Ø5mm drill hole, Ø5mm bolt head (FF 3.16)
  { match: { model: 'S100', shaftDia: 5, threadLength: 12, drillingDistanceB: 34 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.28.188' } },

  // S100 — Ø5mm drill hole, Ø7mm bolt head, Ø8mm bolt hole (FF 3.16)
  { match: { model: 'S100', shaftDia: 5, threadLength: 8, drillingDistanceB: 24 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.27.020' } },
  { match: { model: 'S100', shaftDia: 5, threadLength: 8, drillingDistanceB: 34 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.28.020' } },
  { match: { model: 'S100', shaftDia: 5, threadLength: 11, drillingDistanceB: 24 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.27.029' } },
  { match: { model: 'S100', shaftDia: 5, threadLength: 11, drillingDistanceB: 34 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.28.026' } },
  { match: { model: 'S100', shaftDia: 5, threadLength: 15, drillingDistanceB: 24 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.27.234' } },
  { match: { model: 'S100', shaftDia: 5, threadLength: 15, drillingDistanceB: 34 }, entry: { hardwareName: 'S100 Connecting bolt', catalogNo: '262.28.839' } },

  // S100 with M4 thread (FF 3.17) — Ø7mm bolt head, Ø8mm bolt hole
  { match: { model: 'S100', shaftDia: 5, threadLength: 7.5, drillingDistanceB: 24 }, entry: { hardwareName: 'S100 M4 bolt', catalogNo: '262.27.038' } },
  { match: { model: 'S100', shaftDia: 5, threadLength: 7.5, drillingDistanceB: 34 }, entry: { hardwareName: 'S100 M4 bolt', catalogNo: '262.28.035' } },

  // ══════════════════════════════════════════
  // Capped bolt with flat head (FF 3.19) — Ø8mm bolt hole
  // ══════════════════════════════════════════
  { match: { model: 'CAPPED_FLAT', shaftDia: 8, threadLength: 16, drillingDistanceB: 24 }, entry: { hardwareName: 'Capped bolt (flat head)', catalogNo: '262.27.755' } },
  { match: { model: 'CAPPED_FLAT', shaftDia: 8, threadLength: 16, drillingDistanceB: 34 }, entry: { hardwareName: 'Capped bolt (flat head)', catalogNo: '262.28.755' } },
  { match: { model: 'CAPPED_FLAT', shaftDia: 8, threadLength: 19, drillingDistanceB: 24 }, entry: { hardwareName: 'Capped bolt (flat head)', catalogNo: '262.27.765' } },
  { match: { model: 'CAPPED_FLAT', shaftDia: 8, threadLength: 19, drillingDistanceB: 34 }, entry: { hardwareName: 'Capped bolt (flat head)', catalogNo: '262.28.765' } },

  // Capped bolt with countersunk head (FF 3.19) — Ø9mm bolt hole
  { match: { model: 'CAPPED_CSK', shaftDia: 9, threadLength: 16, drillingDistanceB: 24 }, entry: { hardwareName: 'Capped bolt (countersunk)', catalogNo: '262.27.797' } },

  // Double-ended bolt with snap ring (FF 3.19) — Ø8mm bolt hole
  { match: { model: 'DOUBLE_SNAP', shaftDia: 8, threadLength: 16, drillingDistanceB: 24 }, entry: { hardwareName: 'Double-ended bolt', catalogNo: '262.27.109' } },
  { match: { model: 'DOUBLE_SNAP', shaftDia: 8, threadLength: 16, drillingDistanceB: 34 }, entry: { hardwareName: 'Double-ended bolt', catalogNo: '262.28.106' } },
  { match: { model: 'DOUBLE_SNAP', shaftDia: 8, threadLength: 19, drillingDistanceB: 24 }, entry: { hardwareName: 'Double-ended bolt', catalogNo: '262.27.118' } },
  { match: { model: 'DOUBLE_SNAP', shaftDia: 8, threadLength: 19, drillingDistanceB: 34 }, entry: { hardwareName: 'Double-ended bolt', catalogNo: '262.28.115' } },

  // Double-ended bolt with ridge (FF 3.19) — Ø7mm bolt hole, edge-to-edge
  { match: { model: 'DOUBLE_RIDGE', shaftDia: 7, threadLength: 0, drillingDistanceB: 34 }, entry: { hardwareName: 'Double-ended bolt (ridge)', catalogNo: '262.28.286' } },

  // ══════════════════════════════════════════
  // Mitre-joint connectors (FF 3.20) — Ø7mm bolt hole
  // ══════════════════════════════════════════
  { match: { model: 'MITRE', shaftDia: 7, threadLength: 11, drillingDistanceB: 24 }, entry: { hardwareName: 'Mitre-joint bolt', catalogNo: '262.12.822' } },
  { match: { model: 'MITRE', shaftDia: 7, threadLength: 11, drillingDistanceB: 44 }, entry: { hardwareName: 'Mitre-joint bolt', catalogNo: '262.12.804' } },
  // Mitre-joint with M6 thread
  { match: { model: 'MITRE_M6', shaftDia: 7, threadLength: 7.5, drillingDistanceB: 24 }, entry: { hardwareName: 'Mitre-joint M6 bolt', catalogNo: '262.12.840' } },
  { match: { model: 'MITRE_M6', shaftDia: 7, threadLength: 7.5, drillingDistanceB: 44 }, entry: { hardwareName: 'Mitre-joint M6 bolt', catalogNo: '262.12.984' } },

  // ══════════════════════════════════════════
  // Maxifix S35 Connecting bolt (FF 3.23)
  // Ø9mm bolt hole, Ø35mm housing
  // ══════════════════════════════════════════
  { match: { model: 'S35', shaftDia: 9, threadLength: 16, drillingDistanceB: 35 }, entry: { hardwareName: 'Maxifix S35 bolt', catalogNo: '262.87.931' } },
  { match: { model: 'S35', shaftDia: 9, threadLength: 16, drillingDistanceB: 55 }, entry: { hardwareName: 'Maxifix S35 bolt', catalogNo: '262.87.932' } },
];

// ============================================
// MAXIFIX HOUSING CATALOG
// ============================================

interface MaxifixHousingKey {
  housingDia: number;    // 35mm
  woodThickness: number; // from 19mm
  driveType: string;     // 'cross_slot' | 'hexagon'
}

const MAXIFIX_HOUSING_CATALOG: Array<{ match: MaxifixHousingKey; entry: HardwareCatalogEntry }> = [
  // FF 3.22: Maxifix® housing — Ø35mm, nickel plated
  { match: { housingDia: 35, woodThickness: 19, driveType: 'cross_slot' }, entry: { hardwareName: 'Maxifix® housing', catalogNo: '262.87.713' } },
  { match: { housingDia: 35, woodThickness: 19, driveType: 'hexagon' }, entry: { hardwareName: 'Maxifix® housing', catalogNo: '262.87.703' } },
];

// ============================================
// DOWEL CATALOG
// ============================================

/** Dowel keyed by diameter + length */
interface DowelKey {
  diameter: number;  // mm
  length: number;    // mm (total length, not bore depth)
}

// Häfele FC 11.64: Wood Dowels (Fluted) — Kiln-dried hardwood
const DOWEL_CATALOG: Array<{ match: DowelKey; entry: HardwareCatalogEntry }> = [
  // Ø5mm
  { match: { diameter: 5, length: 30 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.030' } },
  { match: { diameter: 5, length: 35 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.035' } },
  { match: { diameter: 5, length: 40 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.040' } },
  // Ø6mm
  { match: { diameter: 6, length: 25 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.125' } },
  { match: { diameter: 6, length: 30 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.130' } },
  // Ø8mm
  { match: { diameter: 8, length: 25 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.225' } },
  { match: { diameter: 8, length: 30 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.230' } },
  { match: { diameter: 8, length: 32 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.232' } },
  { match: { diameter: 8, length: 35 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.235' } },
  { match: { diameter: 8, length: 38 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.238' } },
  { match: { diameter: 8, length: 40 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.240' } },
  { match: { diameter: 8, length: 50 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.250' } },
  // Ø10mm
  { match: { diameter: 10, length: 30 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.330' } },
  { match: { diameter: 10, length: 50 }, entry: { hardwareName: 'Wood Dowel (Fluted)', catalogNo: '267.83.350' } },
];

// Häfele FC 11.64: Pre-Glued Multi-Grooved (Fluted) Wood Dowels
const PREGLUED_DOWEL_CATALOG: Array<{ match: DowelKey; entry: HardwareCatalogEntry }> = [
  // Ø6mm
  { match: { diameter: 6, length: 25 }, entry: { hardwareName: 'Pre-Glued Dowel', catalogNo: '267.84.125' } },
  { match: { diameter: 6, length: 30 }, entry: { hardwareName: 'Pre-Glued Dowel', catalogNo: '267.84.130' } },
  // Ø8mm
  { match: { diameter: 8, length: 25 }, entry: { hardwareName: 'Pre-Glued Dowel', catalogNo: '267.84.225' } },
  { match: { diameter: 8, length: 30 }, entry: { hardwareName: 'Pre-Glued Dowel', catalogNo: '267.84.230' } },
  { match: { diameter: 8, length: 32 }, entry: { hardwareName: 'Pre-Glued Dowel', catalogNo: '267.84.232' } },
  { match: { diameter: 8, length: 35 }, entry: { hardwareName: 'Pre-Glued Dowel', catalogNo: '267.84.235' } },
  { match: { diameter: 8, length: 38 }, entry: { hardwareName: 'Pre-Glued Dowel', catalogNo: '267.84.238' } },
];

// ============================================
// LOOKUP FUNCTIONS
// ============================================

/**
 * Look up Minifix housing catalog entry.
 */
export function lookupHousing(
  camDia: number,
  woodThickness: number,
  withRim = true,
): HardwareCatalogEntry {
  // Find exact match
  const exact = HOUSING_CATALOG.find(
    (h) => h.match.camDia === camDia && h.match.woodThickness === woodThickness && h.match.withRim === withRim,
  );
  if (exact) return exact.entry;

  // Fallback: find nearest wood thickness with same camDia + rim
  const candidates = HOUSING_CATALOG.filter((h) => h.match.camDia === camDia && h.match.withRim === withRim);
  if (candidates.length > 0) {
    // Find the nearest thickness that's ≤ woodThickness
    const suitable = candidates
      .filter((c) => c.match.woodThickness <= woodThickness)
      .sort((a, b) => b.match.woodThickness - a.match.woodThickness);
    if (suitable.length > 0) return suitable[0].entry;
    return candidates[0].entry;
  }

  // Generic fallback
  const prefix = camDia === 12 ? 'Minifix® 12' : 'Minifix® 15';
  return { hardwareName: `${prefix}${withRim ? ' with rim' : ' without rim'}`, catalogNo: '' };
}

/**
 * Look up connecting bolt catalog entry.
 */
export function lookupBolt(
  model: string,
  shaftDia: number,
  threadLength: number,
  drillingDistanceB: number,
): HardwareCatalogEntry {
  // Try exact match
  const exact = BOLT_CATALOG.find(
    (b) =>
      b.match.model === model &&
      b.match.shaftDia === shaftDia &&
      Math.abs(b.match.threadLength - threadLength) < 0.5 &&
      b.match.drillingDistanceB === drillingDistanceB,
  );
  if (exact) return exact.entry;

  // Try same model + shaftDia + drillingDistanceB (ignore threadLength)
  const partial = BOLT_CATALOG.find(
    (b) => b.match.model === model && b.match.shaftDia === shaftDia && b.match.drillingDistanceB === drillingDistanceB,
  );
  if (partial) return partial.entry;

  // Try just model name
  const modelMatch = BOLT_CATALOG.find((b) => b.match.model === model);
  if (modelMatch) return { hardwareName: modelMatch.entry.hardwareName, catalogNo: '' };

  return { hardwareName: `${model} Connecting bolt`, catalogNo: '' };
}

/**
 * Look up dowel catalog entry.
 */
export function lookupDowel(diameter: number, totalLength: number): HardwareCatalogEntry {
  // Exact match in standard fluted dowels
  const exact = DOWEL_CATALOG.find((d) => d.match.diameter === diameter && d.match.length === totalLength);
  if (exact) return exact.entry;

  // Try pre-glued dowels
  const preglued = PREGLUED_DOWEL_CATALOG.find((d) => d.match.diameter === diameter && d.match.length === totalLength);
  if (preglued) return preglued.entry;

  // Nearest length with same diameter (fluted)
  const sameDia = DOWEL_CATALOG.filter((d) => d.match.diameter === diameter);
  if (sameDia.length > 0) {
    sameDia.sort((a, b) => Math.abs(a.match.length - totalLength) - Math.abs(b.match.length - totalLength));
    return { hardwareName: sameDia[0].entry.hardwareName, catalogNo: sameDia[0].entry.catalogNo };
  }

  return { hardwareName: `Wood Dowel Ø${diameter}×${totalLength}`, catalogNo: '' };
}

/**
 * Master lookup: given a drill point's purpose, dimensions, and config → hardware info.
 * Call this when creating each DrillMapPoint in generateDrillMap.
 */
export function lookupHardwareCatalog(
  purpose: DrillPurpose,
  diameter: number,
  depth: number,
  config: MinifixConfig,
  options?: {
    specLength?: number;   // total dowel length
    model?: string;        // bolt model hint
  },
): HardwareCatalogEntry {
  const model = options?.model || 'S200';
  const B = config.drillingDistanceB;

  switch (purpose) {
    case 'CAM_LOCK':
    case 'MINIFIX':
      return lookupHousing(config.camDia, config.woodThickness, true);

    case 'BOLT':
    case 'BOLT_ENTRY':
      // Bolt bore (sleeve hole) — refers to the connecting bolt
      return lookupBolt(model, config.shaftDia, config.shaftLength, B);

    case 'BOLT_THREAD':
      // Thread bore (shaft hole) — same bolt, different bore
      return lookupBolt(model, config.shaftDia, config.shaftLength, B);

    case 'DOWEL':
      return lookupDowel(diameter, options?.specLength ?? config.dowelLength);

    case 'SHELF_PIN':
      return { hardwareName: 'Shelf Pin', catalogNo: '' };

    case 'HINGE':
      return { hardwareName: 'Hinge Cup', catalogNo: '' };

    case 'DRAWER_SLIDE':
      return { hardwareName: 'Drawer Slide', catalogNo: '' };

    default:
      return { hardwareName: purpose, catalogNo: '' };
  }
}
