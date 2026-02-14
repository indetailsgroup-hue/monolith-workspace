/**
 * Connector OS v1.1 - Hardware Catalog (Gems Catalog)
 *
 * Data-driven connector definitions for Minifix 15 and Target J10.
 * All values per Häfele FF 3.10 and Italiana Ferramenta specifications.
 *
 * @see docs/connector-os/hardware-catalog.md
 */

import type {
  ConnectorSpec,
  ConnectorPlacementProfile,
  MaterialStackPreset,
  ConnectorFamily,
} from './types';

// ──────────────────────────────────────────────────────────────────────────────
// Gems Part Numbers (International Hardware Catalogs)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Häfele Minifix S200 Part Numbers.
 * Source: Häfele FF 3.10 Catalog.
 *
 * @see Master Specification v1.1 §6
 */
export const HAFELE_PART_NUMBERS = {
  /** Minifix 15 Housing, Ø15mm, for 16mm+ wood (262.25.533) */
  MINIFIX_15_HOUSING_16MM_PLUS: '262.25.533',
  /** Connecting Bolt S200, Distance B=24mm (262.27.462) */
  CONNECTING_BOLT_S200_B24: '262.27.462',
} as const;

/**
 * Italiana Ferramenta Part Numbers.
 * Source: Italiana Ferramenta Hardware Catalog.
 *
 * @see Master Specification v1.1 §6
 */
export const ITALIANA_PART_NUMBERS = {
  /** Target J10 Housing P10.18, for 18mm wood (21821320YA) */
  TARGET_J10_HOUSING_P10_18MM: '21821320YA',
  /** Insert Nut M6×13 (20102020GR) */
  INSERT_NUT_M6X13: '20102020GR',
} as const;

/**
 * Häfele Wood Dowel Part Numbers.
 * Source: Häfele FF 3.10 Catalog.
 *
 * Standard beech wood dowels for reinforcement joints.
 * @see DowelCatalog.ts for full spec (D8x30)
 */
export const HAFELE_WOOD_DOWEL_PART_NUMBERS = {
  /** Fluted Beech Dowel 8×30mm (262.00.110) */
  WOOD_DOWEL_8X30_FLUTED: '262.00.110',
} as const;

// ──────────────────────────────────────────────────────────────────────────────
// Connector Specs
// ──────────────────────────────────────────────────────────────────────────────

export const HAFELE_MINIFIX_15_B24: ConnectorSpec = {
  connectorId: 'HAFELE_MINIFIX_15_B24',
  brand: 'Hafele',
  family: 'MINIFIX',
  features: [
    {
      id: 'CAM',
      kind: 'FACE_BORE',
      role: 'STRUCTURAL',
      diaMm: 15,
      depthMm: 13.5, // 18mm wood per Häfele FF 3.10
      refFrame: 'CORE',
      refSurface: 'INNER_FACE',
      refEdgePrimary: 'JOIN_EDGE',
      offsetPrimaryMm: 24, // Distance B
      axisPrimary: 'U',
      refEdgeSecondary: 'FRONT_EDGE',
      offsetSecondaryMm: 37, // System 32 first hole
      axisSecondary: 'V',
    },
    {
      id: 'BOLT',
      kind: 'EDGE_BORE',
      role: 'STRUCTURAL',
      diaMm: 8,
      depthMm: 34,
      refFrame: 'CORE',
      refSurface: 'INNER_FACE',
      refEdgePrimary: 'JOIN_EDGE',
      offsetPrimaryMm: 0,
      axisPrimary: 'U',
      refEdgeSecondary: 'FRONT_EDGE',
      offsetSecondaryMm: 37,
      axisSecondary: 'V',
    },
  ],
};

export const IF_TARGET_J10: ConnectorSpec = {
  connectorId: 'IF_TARGET_J10',
  brand: 'Italiana Ferramenta',
  family: 'TARGET_J',
  features: [
    {
      id: 'PINION',
      kind: 'FACE_BORE',
      role: 'STRUCTURAL',
      diaMm: 10,
      depthMm: 13,
      refFrame: 'CORE',
      refSurface: 'INNER_FACE',
      refEdgePrimary: 'JOIN_EDGE',
      offsetPrimaryMm: 9.5,
      axisPrimary: 'U',
      refEdgeSecondary: 'FRONT_EDGE',
      offsetSecondaryMm: 37,
      axisSecondary: 'V',
      transform: { type: 'OFFSET_DELTA', deltaMm: -25 }, // B = A - 25
    },
    {
      id: 'DOWEL',
      kind: 'EDGE_BORE',
      role: 'STRUCTURAL',
      diaMm: 10,
      depthMm: 12,
      refFrame: 'CORE',
      refSurface: 'INNER_FACE',
      refEdgePrimary: 'JOIN_EDGE',
      offsetPrimaryMm: 0,
      axisPrimary: 'U',
      refEdgeSecondary: 'FRONT_EDGE',
      offsetSecondaryMm: 37,
      axisSecondary: 'V',
    },
  ],
};

/**
 * Häfele Wood Dowel 8×30mm - Standalone Reinforcement Connector
 *
 * Used alongside Minifix to provide shear resistance and panel alignment.
 * Each dowel produces a paired bore: EDGE_BORE on Bottom + FACE_BORE on Side.
 *
 * Physical spec: Ø8mm fluted beech, 30mm total length (15mm per side).
 * @see DowelCatalog.ts D8x30 for full material data
 */
export const HAFELE_WOOD_DOWEL_8x30: ConnectorSpec = {
  connectorId: 'HAFELE_WOOD_DOWEL_8x30',
  brand: 'Hafele',
  family: 'DOWEL',
  features: [
    {
      id: 'DOWEL_EDGE',
      kind: 'EDGE_BORE',
      role: 'STRUCTURAL',
      diaMm: 8,
      depthMm: 15, // holeDepthPerSide for D8x30
      refFrame: 'CORE',
      refSurface: 'INNER_FACE',
      refEdgePrimary: 'JOIN_EDGE',
      offsetPrimaryMm: 0,
      axisPrimary: 'U',
      refEdgeSecondary: 'FRONT_EDGE',
      offsetSecondaryMm: 37, // System 32 first hole
      axisSecondary: 'V',
    },
    {
      id: 'DOWEL_FACE',
      kind: 'FACE_BORE',
      role: 'STRUCTURAL',
      diaMm: 8,
      depthMm: 15, // holeDepthPerSide for D8x30
      refFrame: 'CORE',
      refSurface: 'INNER_FACE',
      refEdgePrimary: 'JOIN_EDGE',
      offsetPrimaryMm: 0,
      axisPrimary: 'U',
      refEdgeSecondary: 'FRONT_EDGE',
      offsetSecondaryMm: 37,
      axisSecondary: 'V',
    },
  ],
};

// ──────────────────────────────────────────────────────────────────────────────
// Placement Profiles
// ──────────────────────────────────────────────────────────────────────────────

export const KITCHEN_PREMIUM_PROFILE: ConnectorPlacementProfile = {
  id: 'KITCHEN_PREMIUM',
  system32: { firstHole: 37, pitch: 32, endOffset: 40 },
  constraints: {
    minPerJoint: 2,
    maxSpacingMm: 128,
    loadOverrides: {
      LIGHT: { maxSpacingMm: 128 },
      STANDARD: { maxSpacingMm: 128 },
      HEAVY: { maxSpacingMm: 96 },
    },
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Material Stack Presets
// ──────────────────────────────────────────────────────────────────────────────

export const HMR18_HPL08x2_PVC1: MaterialStackPreset = {
  id: 'HMR18_HPL0p8x2_PVC1',
  core: { material: 'HMR_GREEN', thickness: 18.0 },
  surface: { material: 'HPL_GREY_OAK', thickness: 0.8, sides: 2 },
  edge: { material: 'PVC_GREY', thickness: 1.0 },
  resolved: {
    coreThk: 18.0,
    finishedThk: 19.6,
    edgeThk: 1.0,
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Selection Helper
// ──────────────────────────────────────────────────────────────────────────────

export function selectConnector(
  _coreThk: number,
  family: ConnectorFamily,
): ConnectorSpec {
  if (family === 'TARGET_J') return IF_TARGET_J10;
  if (family === 'DOWEL') return HAFELE_WOOD_DOWEL_8x30;
  return HAFELE_MINIFIX_15_B24;
}
