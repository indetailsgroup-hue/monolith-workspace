/**
 * Default Minifix S200 Configuration
 *
 * Separated from Minifix3DPreview.tsx to enable proper HMR (Hot Module Replacement).
 * Moving non-component exports to a separate file prevents "hmr invalidate" warnings.
 */

import type { MinifixConfig } from './types';

/**
 * Default Minifix S200 configuration for 18mm wood panels.
 *
 * Häfele Specifications (FF 3.10 catalog):
 * ┌────────────────────┬─────────┬────────────────────────────────────┐
 * │ Parameter          │ Value   │ คำอธิบาย                            │
 * ├────────────────────┼─────────┼────────────────────────────────────┤
 * │ drillingDistanceB  │ 24mm    │ ระยะ B (ขอบไม้ → แกนกลาง Bolt)      │
 * │ camDia             │ 15mm    │ รู Cam                              │
 * │ camDepth           │ 13.5mm  │ ความลึก Cam (18mm wood)            │
 * │ camHeight (dimA)   │ 9mm     │ ระยะจากผิวไม้ถึงแกนกลาง              │
 * │ sleeveDia          │ 10mm    │ รู Bolt                             │
 * │ sleeveLength       │ 17.5mm  │ ความลึก Bolt                        │
 * │ shaftLength (L)    │ 11mm    │ ก้านเกลียว                          │
 * └────────────────────┴─────────┴────────────────────────────────────┘
 */
export const DEFAULT_MINIFIX_S200_CONFIG: MinifixConfig = {
  minifixType: '15',
  drillingDistanceB: 24,        // ระยะ B (ขอบไม้ → แกนกลาง Bolt) - 24mm per CAD spec
  woodThickness: 18,            // ความหนาไม้ (project default)

  // Ball Head (หัวกลม)
  ballHeadDia: 6.5,             // Ø6.5mm per Häfele catalog
  ballHeadOffset: 0,

  // Neck Shaft (แกนเหล็ก)
  neckShaftDia: 6.5,            // Ø6.5mm
  neckShaftLength: 6.5,         // 6.5mm
  neckShaftOffset: 0,

  // Sleeve (ปลอก) - BOLT HOLE
  sleeveDia: 10,                // Ø10mm - รู Bolt
  sleeveLength: 17.5,           // 17.5mm - ความลึก Bolt (kept for backward compat)
  sleeveOffset: 0,
  boltBoreDepth: 17.5,          // 17.5mm - authoritative bolt drilling depth (Häfele S200)

  // Shaft (ก้านเกลียว)
  shaftDia: 5,                  // Ø5mm
  shaftLength: 11,              // 11mm (L dimension)
  shaftOffset: 0,

  // Cam Housing
  camDia: 15,                   // Ø15mm - รู Cam
  camDepth: 13.5,               // 13.5mm - ความลึก Cam (for 18mm wood per Häfele FF 3.10)
  camHeight: 9,                 // 9mm - dimA (ระยะจากผิวไม้ถึงแกนกลาง, 18mm wood)
  camRimDia: 18,                // Ø18mm - rim diameter
  camRimHeight: 2,              // 2mm - rim height
  camOffset: 0,

  // Dowel (enabled per CAD reference - System 32 offset)
  includeDowel: true,
  dowelDia: 8,                  // Ø8mm
  dowelLength: 30,              // 30mm (รวม: edge + face = 18 + 12)
  dowelOffset: 32,              // 32mm (System 32)
  // HÄFELE STANDARD: Split depth ป้องกันไม้ปูดในแผ่นหนา 16-19mm
  dowelDepthEdge: 18,           // 18mm เจาะเข้าขอบแผงข้าง (EDGE_BORE)
  dowelDepthFace: 12,           // 12mm เจาะเข้าพื้นผิว TOP/BOTTOM (FACE_BORE)
};
