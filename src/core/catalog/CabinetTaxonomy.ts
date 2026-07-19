/**
 * Cabinet Taxonomy - Built-in Cabinet Catalog System
 *
 * ARCHITECTURE (North Star v4.0):
 * - Standard cabinet types with ergonomic dimensions
 * - Ventilation requirements for appliance units
 * - Corner cabinet algorithms
 * - BIM classification codes (OmniClass/Uniclass)
 * - Face Frame vs Frameless construction types
 *
 * REFERENCE: Kitchen Industry Standards (NKBA/KCMA), JIS A0017:2018, next125 published spec
 */

import { calculateRealThickness } from '../types/panelFormulas';
import {
  CORE_MATERIALS_CATALOG,
  SURFACE_MATERIALS_CATALOG,
  EDGE_MATERIALS_CATALOG,
} from '../materials/PanelMaterialSystem';
import { DEFAULT_WORKTOP_CONFIG } from '../worktop/types';
import type { WorktopConfig } from '../worktop/types';
import {
  DEFAULT_PLINTH_LEG,
  assessLegReachability,
  computeLevellingTolerance,
} from './PlinthLegCatalog';
import type {
  PlinthLeg,
  LegReachability,
  LevellingTolerance,
  LegProvenance,
} from './PlinthLegCatalog';

// IMPORT-CYCLE NOTE: all three modules above are runtime leaves as seen from here.
// PanelMaterialSystem imports nothing; panelFormulas imports nothing; worktop/types'
// only edge back to types/Cabinet is `import type`, which isolatedModules erases.
// types/Cabinet.ts imports FROM this file (for DEFAULT_TOE_KICK_HEIGHT_MM and the base
// depth default), so this file must never import types/Cabinet.ts. That is exactly why
// calculateRealThickness was extracted into panelFormulas.ts.

// ============================================
// BIM CLASSIFICATION CODES
// ============================================

/**
 * OmniClass Classification (North America)
 * Table 23: Products - Used for BIM object classification
 *
 * Reference: https://www.omniclass.org/
 */
export interface OmniClassCode {
  table: string;      // Table number (e.g., "23")
  number: string;     // Full classification number
  title: string;      // Official title
}

export const OMNICLASS_CODES: Record<string, OmniClassCode> = {
  // Casework (General)
  CASEWORK: {
    table: '23',
    number: '23-21 23 00',
    title: 'Casework',
  },
  // Base Cabinets
  BASE_CABINET: {
    table: '23',
    number: '23-21 23 13',
    title: 'Base Cabinets',
  },
  // Wall Cabinets
  WALL_CABINET: {
    table: '23',
    number: '23-21 23 16',
    title: 'Wall Cabinets',
  },
  // Tall Cabinets
  TALL_CABINET: {
    table: '23',
    number: '23-21 23 19',
    title: 'Tall Cabinets',
  },
  // Kitchen Casework
  KITCHEN_CASEWORK: {
    table: '23',
    number: '23-21 23 13 11',
    title: 'Residential Kitchen Casework',
  },
  // Laboratory Casework
  LAB_CASEWORK: {
    table: '23',
    number: '23-21 23 13 14',
    title: 'Laboratory Casework',
  },
};

/**
 * Uniclass 2015 Classification (UK/International)
 * Systems (Ss) and Products (Pr) tables
 *
 * Reference: https://www.thenbs.com/our-tools/uniclass-2015
 */
export interface UniclassCode {
  table: 'Ss' | 'Pr' | 'EF';  // Systems, Products, or Elements/Functions
  number: string;              // Classification number
  title: string;               // Official title
}

export const UNICLASS_CODES: Record<string, UniclassCode> = {
  // Systems - Fitted furniture
  FITTED_FURNITURE_SYSTEM: {
    table: 'Ss',
    number: 'Ss_45_40',
    title: 'Fitted furniture systems',
  },
  // Systems - Kitchen
  KITCHEN_SYSTEM: {
    table: 'Ss',
    number: 'Ss_45_40_42',
    title: 'Kitchen unit systems',
  },
  // Products - Base units
  BASE_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_07',
    title: 'Base units',
  },
  // Products - Wall units
  WALL_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_95',
    title: 'Wall units',
  },
  // Products - Tall units
  TALL_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_88',
    title: 'Tall units',
  },
  // Products - Corner units
  CORNER_UNIT: {
    table: 'Pr',
    number: 'Pr_40_50_19',
    title: 'Corner units',
  },
  // Elements - FF Fittings, furnishings and equipment
  FITTINGS_ELEMENT: {
    table: 'EF',
    number: 'EF_45',
    title: 'Fittings, furnishings and equipment',
  },
};

/**
 * Get BIM classification codes for a cabinet category
 */
export function getBIMCodes(category: CabinetCategory): {
  omniclass: OmniClassCode;
  uniclass: UniclassCode;
} {
  const mapping: Record<CabinetCategory, { omni: string; uni: string }> = {
    BASE: { omni: 'BASE_CABINET', uni: 'BASE_UNIT' },
    WALL: { omni: 'WALL_CABINET', uni: 'WALL_UNIT' },
    TALL: { omni: 'TALL_CABINET', uni: 'TALL_UNIT' },
    CORNER: { omni: 'BASE_CABINET', uni: 'CORNER_UNIT' },
    APPLIANCE: { omni: 'KITCHEN_CASEWORK', uni: 'KITCHEN_SYSTEM' },
  };

  const codes = mapping[category];
  return {
    omniclass: OMNICLASS_CODES[codes.omni],
    uniclass: UNICLASS_CODES[codes.uni],
  };
}

// ============================================
// CONSTRUCTION TYPE (Face Frame vs Frameless)
// ============================================

/**
 * Cabinet Construction Type
 *
 * FACE_FRAME (American Traditional):
 * - Solid wood frame attached to front of cabinet box
 * - Doors/drawers attach to frame
 * - More structural rigidity
 * - Slightly reduced interior space due to frame
 * - Overlay: Full, Half, or Inset
 *
 * FRAMELESS (European/32mm System):
 * - No front frame, doors attach directly to sides
 * - Full access to interior space
 * - Based on 32mm hole pattern for hardware
 * - Cleaner, modern appearance
 * - Requires thicker side panels (typically 18mm+)
 */
export type ConstructionType = 'FACE_FRAME' | 'FRAMELESS';

export interface ConstructionTypeSpec {
  type: ConstructionType;
  name: string;
  nameTH: string;
  description: string;

  // Structural requirements
  minSidePanelThickness: number;   // mm
  requiresFrontFrame: boolean;
  holePatternSpacing?: number;     // mm (32mm for frameless)

  // Door mounting
  hingeType: 'frame-mount' | 'side-mount';
  typicalOverlay: 'full' | 'half' | 'inset';

  // Space efficiency
  interiorWidthReduction: number;  // mm lost to frame (per side)
}

export const CONSTRUCTION_TYPES: Record<ConstructionType, ConstructionTypeSpec> = {
  FACE_FRAME: {
    type: 'FACE_FRAME',
    name: 'Face Frame (American)',
    nameTH: 'แบบมีกรอบหน้า (อเมริกัน)',
    description: 'Traditional construction with solid wood frame on cabinet front',
    minSidePanelThickness: 12,
    requiresFrontFrame: true,
    hingeType: 'frame-mount',
    typicalOverlay: 'half',
    interiorWidthReduction: 38,  // ~1.5" frame stile per side
  },
  FRAMELESS: {
    type: 'FRAMELESS',
    name: 'Frameless (European 32mm)',
    nameTH: 'แบบไร้กรอบ (ยุโรป 32mm)',
    description: 'Modern construction with doors mounted directly to sides, 32mm system',
    minSidePanelThickness: 18,
    requiresFrontFrame: false,
    holePatternSpacing: 32,
    hingeType: 'side-mount',
    typicalOverlay: 'full',
    interiorWidthReduction: 0,
  },
};

/**
 * Calculate interior cabinet width based on construction type
 */
export function calculateInteriorWidth(
  exteriorWidth: number,
  panelThickness: number,
  constructionType: ConstructionType
): number {
  const spec = CONSTRUCTION_TYPES[constructionType];

  // Subtract panel thickness from both sides
  let interiorWidth = exteriorWidth - (panelThickness * 2);

  // Subtract frame if face frame construction
  if (spec.requiresFrontFrame) {
    interiorWidth -= spec.interiorWidthReduction;
  }

  return interiorWidth;
}

/**
 * Get 32mm system hole positions for frameless cabinets
 *
 * The 32mm system uses a standardized hole pattern:
 * - Holes spaced 32mm apart vertically
 * - First hole 37mm from top/bottom
 * - Holes 37mm from front edge
 * - Used for shelf pins, hinges, drawer slides
 */
export function get32mmHolePositions(
  panelHeight: number,
  startFromTop: number = 37,
  startFromBottom: number = 37
): number[] {
  const positions: number[] = [];
  const usableHeight = panelHeight - startFromTop - startFromBottom;
  const holeCount = Math.floor(usableHeight / 32) + 1;

  for (let i = 0; i < holeCount; i++) {
    positions.push(startFromTop + (i * 32));
  }

  return positions;
}

// ============================================
// CABINET CATEGORY DEFINITIONS
// ============================================

export type CabinetCategory =
  | 'BASE'        // Base cabinets (floor standing)
  | 'WALL'        // Wall cabinets (mounted)
  | 'TALL'        // Tall/Pantry cabinets
  | 'CORNER'      // Corner cabinets
  | 'APPLIANCE';  // Appliance housings

export type CornerType =
  | 'BLIND'       // Blind corner (one accessible side)
  | 'DIAGONAL'    // 45-degree corner
  | 'L_SHAPED'    // L-shaped lazy susan
  | 'MAGIC';      // Magic corner pull-out

export type ApplianceType =
  | 'OVEN'        // Built-in oven
  | 'MICROWAVE'   // Microwave housing
  | 'REFRIGERATOR'// Refrigerator surround
  | 'DISHWASHER'  // Dishwasher panel
  | 'WASHER'      // Washer housing
  | 'HOOD';       // Range hood housing

// ============================================
// PUBLISHED DIMENSIONAL SOURCES
// ============================================

/**
 * JIS A0017:2018 — Japanese Industrial Standard for kitchen furniture dimensions.
 *
 * `plinthRule` is the standard's own relation between plinth height B and finished
 * worktop height A:  B = A - 750.
 *
 * Read that rule carefully, because it is the key to this whole module: it asserts a
 * FIXED 750 mm carcass-plus-worktop assembly. With the 720 mm carcass everyone in this
 * industry uses, JIS is assuming a 30 mm worktop. Applying B = A - 750 to the standard's
 * own worktop heights {800, 850, 900, 950} regenerates its own plinth rungs
 * {50, 100, 150, 200} exactly — the rung set is not an independent list, it is the rule.
 *
 * THE THAI ASSEMBLY IS NOT THE ONE THIS RULE ASSUMES, and that is a real difference in
 * practice rather than an error to correct. This business builds 760 carcass + 20 worktop
 * = 780 mm, i.e. 30 mm TALLER than the 750 the rule assumes. Under the same 850 mm counter
 * height that necessarily yields a plinth 30 mm SHORTER than the JIS rung: 70 mm instead
 * of 100 mm. The hardware that makes that work is a 70 mm-minimum leg, which is exactly
 * the leg the owner buys (PlinthLegCatalog.THAI_ADJUSTABLE_LEG_70).
 *
 * So the JIS rungs remain useful as a cross-check on OTHER markets — the European profile
 * builds 720 + 30 = 750 and therefore lands on rung 150 exactly — but a Thai plinth being
 * off-rung is expected, not a defect. See DEFAULT_HEIGHT_STACK and MARKET_HEIGHT_PROFILES.
 */
export const JIS_A0017_2018 = {
  /** B = A - 750, where A is finished worktop height and B is plinth height. */
  plinthRuleOffsetMm: 750,
  plinthRungsMm: [50, 100, 150, 200] as readonly number[],
  worktopHeightsMm: [800, 850, 900, 950] as readonly number[],
  baseDepthsMm: [600, 650] as readonly number[],
  /** Hard ceiling on wall-unit depth. */
  wallUnitMaxDepthMm: 400,
  /** Minimum floor-to-underside height for a wall unit. */
  wallUnitMinUndersideMm: 1300,
} as const;

/**
 * next125 published plinth rungs. Finer-grained than JIS and includes 75/125/175,
 * confirmed against the next125 published specification.
 */
export const NEXT125_PLINTH_RUNGS_MM: readonly number[] = [50, 75, 100, 125, 150, 175];

/** Union of every plinth height a real manufacturer publishes as a buyable rung. */
export const PUBLISHED_PLINTH_RUNGS_MM: readonly number[] = Array.from(
  new Set([...JIS_A0017_2018.plinthRungsMm, ...NEXT125_PLINTH_RUNGS_MM])
).sort((a, b) => a - b);

/**
 * Finished counter height (floor to top of worktop) by market, mm.
 *
 * - TH 850 — Kvik Thailand and Udomsuk Living agree; 850 is also a listed rung in
 *   JIS A0017:2018 worktopHeightsMm.
 * - EU/UK 900 nominal (published range 870-910) = 720 carcass + 150 plinth + worktop.
 * - JP 850 — JIS A0017:2018.
 * - AU 900.
 * - US 914 (36 in).
 *
 * This is the INPUT to the height stack. Plinth height is the OUTPUT. That direction
 * is the point of the whole exercise: a tenant states the counter height its market
 * requires, and the plinth is whatever closes the stack.
 */
export const COUNTER_HEIGHT_TARGETS_MM = {
  TH: 850,
  JP: 850,
  EU: 900,
  UK: 900,
  AU: 900,
  US: 914,
} as const;

export type CounterHeightMarket = keyof typeof COUNTER_HEIGHT_TARGETS_MM;

/** Primary market default. Thailand. */
export const DEFAULT_COUNTER_HEIGHT_MM: number = COUNTER_HEIGHT_TARGETS_MM.TH;

/**
 * Base carcass height, the stack's middle term, mm. THAI DEFAULT 760. OWNER-CONFIRMED.
 *
 * NOT 720. This file previously said 720 and called it "industry-universal"; 720 is the
 * European figure and it is what a document-only reading of the corpus produces. The
 * owner of the kitchen business this system is built for states 760, and a first-hand
 * statement of what a business actually builds outranks a published standard describing
 * what someone else builds.
 *
 * Anything targeting a European tenant should pass 720 explicitly via HeightStackInput or
 * use MARKET_HEIGHT_PROFILES.EU, rather than changing this constant back.
 */
export const DEFAULT_CARCASS_HEIGHT_MM = 760;

// ============================================
// THE HEIGHT STACK (counter height in, plinth out)
// ============================================

/**
 * Floating-point equality epsilon for rung matching, mm.
 *
 * This is NOT a manufacturing tolerance. Worktop thickness is a sum of decimal
 * catalogue values (18 + 0.3 + 0.3), so the derived plinth carries ~1e-13 of binary
 * representation error. This epsilon absorbs exactly that and nothing else — an
 * 11.4 mm miss is nowhere near it, and must not be.
 */
const RUNG_MATCH_EPSILON_MM = 1e-6;

/**
 * ADVISORY. Something a human should look at; the kitchen still builds.
 */
export type HeightStackWarningCode =
  | 'PLINTH_OFF_PUBLISHED_RUNG'
  | 'COUNTER_HEIGHT_OFF_PUBLISHED_LIST'
  | 'WORKTOP_TARGET_NOT_IN_CATALOG'
  | 'LEG_ADJUSTMENT_TOP_UNSOURCED'
  | 'NO_LEVELLING_HEADROOM_DOWNWARD';

/**
 * UNBUILDABLE. The configuration cannot be assembled from hardware that exists.
 *
 * Split from warnings on purpose, mirroring validateDimensions' two severities. The
 * brief's rule is that a plinth below the minimum leg height must be REJECTED, and a
 * rejection that arrives in the same array as "this is not a published rung" is not a
 * rejection — it is a suggestion that a caller will filter out.
 */
export type HeightStackErrorCode =
  | 'PLINTH_NOT_POSITIVE'
  | 'PLINTH_BELOW_LEG_MINIMUM'
  | 'PLINTH_ABOVE_LEG_MAXIMUM';

export interface HeightStackWarning {
  readonly code: HeightStackWarningCode;
  readonly message: string;
}

export interface HeightStackError {
  readonly code: HeightStackErrorCode;
  readonly message: string;
}

export interface HeightStackInput {
  /** Finished floor-to-worktop-top height, mm. Defaults to the Thai 850. */
  readonly counterHeight?: number;
  /** Base carcass height, mm. Defaults to the Thai 760. */
  readonly carcassHeight?: number;
  /**
   * TARGET finished worktop slab thickness, mm. Defaults to the Thai 20.
   *
   * This is a specification, not a reading of today's material stack. The gap between
   * the two is reported separately (WORKTOP_TARGET_NOT_IN_CATALOG) rather than being
   * resolved by quietly adopting whichever number the catalog happens to produce.
   */
  readonly worktopThickness?: number;
  /**
   * The leg the plinth stands on. Defaults to the owner-confirmed Thai 70mm adjustable.
   * Pass a different leg to model another market's hardware.
   */
  readonly leg?: PlinthLeg;
}

export interface HeightStack {
  readonly counterHeight: number;
  readonly carcassHeight: number;
  readonly worktopThickness: number;
  /** DERIVED: counterHeight - carcassHeight - worktopThickness. Never rounded. */
  readonly plinthHeight: number;
  readonly onPublishedRung: boolean;
  /** Which published standards list this exact plinth height. */
  readonly matchedRungStandards: readonly string[];
  /** The leg this plinth stands on, and whether the derived height is reachable on it. */
  readonly leg: PlinthLeg;
  readonly legReachability: LegReachability;
  /** Floor-levelling headroom the configuration leaves in each direction. */
  readonly levelling: LevellingTolerance;
  /** True when nothing makes the configuration unbuildable. */
  readonly buildable: boolean;
  readonly errors: readonly HeightStackError[];
  readonly warnings: readonly HeightStackWarning[];
}

/**
 * Finished thickness of a worktop slab, derived from its real material stack.
 *
 * Deliberately NOT a constant. The audit's core complaint was invented arithmetic —
 * a "+40 clearance" term that corresponded to no geometry — so the term that closes
 * the height stack has to be read from the same catalogue the cut list is priced from.
 *
 * Throws rather than falling back, matching resolveWorktopMaterials' posture: a silent
 * material substitution here would move every plinth in the kitchen.
 */
export function resolveWorktopThickness(config: WorktopConfig = DEFAULT_WORKTOP_CONFIG): number {
  const core = CORE_MATERIALS_CATALOG[config.coreMaterialId];
  if (!core) {
    throw new Error(`Worktop core material not in catalog: ${config.coreMaterialId}`);
  }
  const surface = SURFACE_MATERIALS_CATALOG[config.surfaceMaterialId];
  if (!surface) {
    throw new Error(`Worktop surface material not in catalog: ${config.surfaceMaterialId}`);
  }
  // Glue excluded (4th arg 0), matching panelRealThickness so the slab this module
  // reasons about is byte-for-byte the slab deriveWorktopPanels emits.
  return calculateRealThickness(core.thickness, surface.thickness, surface.thickness, 0);
}

/**
 * TARGET worktop thickness for the Thai market, mm. OWNER-CONFIRMED.
 *
 * This is a SPECIFICATION, not a measurement of today's material stack. It is the third
 * term of the owner's stack: 70 leg + 760 carcass + 20 worktop = 850 counter.
 *
 * It replaces the previous `resolveWorktopThickness()` default, which read whatever the
 * configured materials happened to sum to (18.6mm) and called that the spec. That had the
 * dependency backwards: the target is stated by the business, and the material stack is
 * then judged against it. See DEFAULT_WORKTOP_THICKNESS_GAP for how far today's catalog
 * falls from this number, which is a real and currently unclosed gap.
 *
 * OPEN QUESTION, NOT DECIDED HERE: whether the Thai 20mm worktop is STONE (granite or
 * quartz — 20mm is the standard 2cm stone thickness, which is suggestive) or a wood-based
 * panel. The owner has not confirmed it. Nothing in this module branches on material
 * class; `findClosestBuildableWorktop` searches only the wood-panel catalog because that
 * is the only catalog that exists. A stone worktop would be a different sourcing lane
 * with different edge, support and cost rules, and must not be assumed into being here.
 */
export const DEFAULT_WORKTOP_THICKNESS_MM = 20;

/**
 * The closest slab this catalog can actually build to a target thickness.
 *
 * A slab qualifies only if it is BUILDABLE on both constraints resolveWorktopMaterials
 * already enforces:
 *   1. moisture-resistant core — a worktop meets water at the sink, and
 *   2. bandable — every entry in EDGE_MATERIALS_CATALOG is 23mm tall, so a slab thicker
 *      than the tallest tape cannot be edged at all.
 *
 * Computed from the catalog rather than asserted in a comment, so it cannot go stale the
 * moment a material is added. Nothing here invents a material, a thickness or a price.
 */
export interface WorktopThicknessGap {
  readonly targetMm: number;
  /** Closest BUILDABLE finished thickness, mm. */
  readonly closestAchievableMm: number;
  /** closestAchievableMm - targetMm. Negative = the best slab is thinner than the target. */
  readonly deltaMm: number;
  readonly exact: boolean;
  readonly coreMaterialId: string;
  readonly surfaceMaterialId: string;
}

export function findClosestBuildableWorktop(targetMm: number): WorktopThicknessGap {
  const tallestTape = Math.max(
    ...Object.values(EDGE_MATERIALS_CATALOG).map((e) => e.height)
  );

  let best: WorktopThicknessGap | null = null;
  for (const core of Object.values(CORE_MATERIALS_CATALOG)) {
    if (!core.moistureResistant) continue;
    for (const surface of Object.values(SURFACE_MATERIALS_CATALOG)) {
      const t = calculateRealThickness(core.thickness, surface.thickness, surface.thickness, 0);
      if (t > tallestTape) continue;
      const delta = t - targetMm;
      if (best === null || Math.abs(delta) < Math.abs(best.deltaMm)) {
        best = {
          targetMm,
          closestAchievableMm: t,
          deltaMm: delta,
          exact: Math.abs(delta) <= RUNG_MATCH_EPSILON_MM,
          coreMaterialId: core.id,
          surfaceMaterialId: surface.id,
        };
      }
    }
  }

  if (best === null) {
    throw new Error(
      'No moisture-resistant, bandable worktop core exists in the catalog at all. ' +
        'A worktop cannot be specified until one is sourced.'
    );
  }
  return best;
}

/**
 * THE FINDING, computed not claimed: the 20mm Thai target is NOT achievable from this
 * catalog, and the closest buildable slab is 19.6mm.
 *
 *   No core is 20mm  (cores run ... 16, 18, 19, 25, 28, 35)
 *   Surfaces are only 0.3mm melamine and 0.8mm HPL
 *   slab = core + 2 x surface, so reaching 20.0 needs a 1.0mm surface on an 18mm core,
 *   or a 0.5mm surface on a 19mm core. NEITHER SURFACE EXISTS.
 *
 * Closest buildable:  18mm HMR + 2 x 0.8mm HPL = 19.6mm, i.e. 0.4mm UNDER target.
 * Next candidate up:  19mm core + 2 x 0.8 = 20.6mm, but BOTH 19mm cores (core-pb-19,
 *                     core-mdf-19) are moistureResistant: false, so 20.6mm is not
 *                     buildable as a worktop at any price.
 *
 * 19.6mm is therefore simultaneously the closest to target AND the thickest buildable
 * moisture-resistant slab in the catalog.
 *
 * NOT SILENTLY ADOPTED. The default worktop config is left on melamine (18.6mm); moving
 * to 19.6mm means swapping a 0.3mm melamine surface for a 0.8mm HPL one, which changes
 * the finish and the quoted cost of every slab in the kitchen. Chasing 0.4mm of thickness
 * by rewriting a customer's material spec is exactly the silent substitution
 * resolveWorktopMaterials throws to prevent. The 0.4mm is absorbed by the adjustable leg
 * instead — see DEFAULT_HEIGHT_STACK — and the material choice is left to a human.
 */
export const DEFAULT_WORKTOP_THICKNESS_GAP: WorktopThicknessGap =
  findClosestBuildableWorktop(DEFAULT_WORKTOP_THICKNESS_MM);

/**
 * What the DEFAULT_WORKTOP_CONFIG material stack actually builds today, mm.
 *
 * Kept as a distinct constant from DEFAULT_WORKTOP_THICKNESS_MM precisely so the two can
 * be compared. Collapsing them is what produced the original defect: the number the code
 * built and the number the code declared were different, and nothing said so.
 */
export const DEFAULT_WORKTOP_BUILT_THICKNESS_MM: number = resolveWorktopThickness();

/** Which published standards list `plinth` as a buyable rung. */
function matchPlinthRung(plinth: number): string[] {
  const matched: string[] = [];
  const hits = (rungs: readonly number[]) =>
    rungs.some((r) => Math.abs(r - plinth) <= RUNG_MATCH_EPSILON_MM);
  if (hits(JIS_A0017_2018.plinthRungsMm)) matched.push('JIS A0017:2018');
  if (hits(NEXT125_PLINTH_RUNGS_MM)) matched.push('next125');
  return matched;
}

/**
 * THE derivation. Counter height is the input; plinth height is the output.
 *
 *     plinthHeight = counterHeight - carcassHeight - worktopThickness
 *
 * Nothing here rounds, snaps or nudges. If the derived plinth is not a rung any
 * manufacturer publishes, that is reported as a warning and the ugly number is
 * returned unchanged — silently rounding it to 100 is precisely how the stack came to
 * be 61.4 mm short of its own declared target in the first place.
 */
export function deriveHeightStack(input: HeightStackInput = {}): HeightStack {
  const counterHeight = input.counterHeight ?? DEFAULT_COUNTER_HEIGHT_MM;
  const carcassHeight = input.carcassHeight ?? DEFAULT_CARCASS_HEIGHT_MM;
  const worktopThickness = input.worktopThickness ?? DEFAULT_WORKTOP_THICKNESS_MM;
  const leg = input.leg ?? DEFAULT_PLINTH_LEG;

  const plinthHeight = counterHeight - carcassHeight - worktopThickness;

  const warnings: HeightStackWarning[] = [];
  const errors: HeightStackError[] = [];

  if (!(plinthHeight > 0)) {
    errors.push({
      code: 'PLINTH_NOT_POSITIVE',
      message:
        `Derived plinth height is ${plinthHeight.toFixed(1)}mm. A ${carcassHeight}mm carcass ` +
        `plus a ${worktopThickness.toFixed(1)}mm worktop already reaches or exceeds the ` +
        `${counterHeight}mm counter height target, so no plinth can close the stack.`,
    });
  }

  // THE LEG CHECK. The derived plinth is not a free number — it is the height a leg must
  // stand at, and a leg has a physical range. Rejecting here is the whole point: a
  // configuration needing less than the shortest leg you can buy is unbuildable, and
  // rounding it up would silently raise the finished worktop above the customer's
  // specified counter height.
  const legReachability = assessLegReachability(plinthHeight, leg);
  const levelling = legReachability.tolerance;

  if (!legReachability.reachable) {
    errors.push({
      code:
        legReachability.code === 'BELOW_LEG_MINIMUM'
          ? 'PLINTH_BELOW_LEG_MINIMUM'
          : 'PLINTH_ABOVE_LEG_MAXIMUM',
      message: legReachability.message,
    });
  }

  if (legReachability.reachable && legReachability.upperBoundUnverified) {
    warnings.push({
      code: 'LEG_ADJUSTMENT_TOP_UNSOURCED',
      message:
        `Leg ${leg.id} has no sourced maximum height, so the UPWARD levelling headroom at a ` +
        `${plinthHeight.toFixed(1)}mm plinth is UNKNOWN — not unlimited. ${leg.note}`,
    });
  }

  // The levelling finding. At the Thai default this fires with 0.0mm, which is the single
  // most consequential installation fact in the whole stack: 850 - 760 - 20 lands the
  // plinth exactly on the leg's wound-fully-down height, so there is NO room to shorten a
  // leg anywhere in the kitchen.
  if (legReachability.reachable && levelling.shortenHeadroom <= RUNG_MATCH_EPSILON_MM) {
    warnings.push({
      code: 'NO_LEVELLING_HEADROOM_DOWNWARD',
      message:
        `Plinth ${plinthHeight.toFixed(1)}mm sits exactly on leg ${leg.id}'s ${leg.minHeight}mm ` +
        `minimum, leaving ${levelling.shortenHeadroom.toFixed(1)}mm of downward adjustment. A ` +
        `PERFECTLY FLAT FLOOR is the lower bound of this configuration: every leg is already ` +
        `wound fully down, so a floor HIGH spot cannot be absorbed by shortening a leg. It must ` +
        `be ground down, or the whole run datumed off the high point (raising every other leg). ` +
        `All remaining adjustment is headroom for LOW spots only.`,
    });
  }

  const matchedRungStandards = matchPlinthRung(plinthHeight);
  const onPublishedRung = matchedRungStandards.length > 0;

  if (!onPublishedRung && plinthHeight > 0) {
    // Quantify the miss against the JIS rule rather than just saying "not a rung".
    // B = A - 750 means the rung a JIS kitchen would use here is counterHeight - 750,
    // and the gap is entirely explained by how far the real assembly sits from 750.
    const jisRung = counterHeight - JIS_A0017_2018.plinthRuleOffsetMm;
    const assembly = carcassHeight + worktopThickness;
    const shortfall = JIS_A0017_2018.plinthRuleOffsetMm - assembly;
    warnings.push({
      code: 'PLINTH_OFF_PUBLISHED_RUNG',
      message:
        `Derived plinth height ${plinthHeight.toFixed(1)}mm is not a published rung ` +
        `(JIS A0017:2018 ${JIS_A0017_2018.plinthRungsMm.join('/')}; ` +
        `next125 ${NEXT125_PLINTH_RUNGS_MM.join('/')}). ` +
        `JIS rule B = A - ${JIS_A0017_2018.plinthRuleOffsetMm} would give ${jisRung}mm here. ` +
        `The ${shortfall.toFixed(1)}mm difference is the whole miss: carcass ${carcassHeight} + ` +
        `worktop ${worktopThickness.toFixed(1)} = ${assembly.toFixed(1)}mm, against the ` +
        `${JIS_A0017_2018.plinthRuleOffsetMm}mm assembly the rule assumes. ` +
        `NOT rounded — source a ${(worktopThickness + shortfall).toFixed(1)}mm worktop to land on the rung.`,
    });
  }

  if (!(JIS_A0017_2018.worktopHeightsMm as readonly number[]).includes(counterHeight)) {
    const known: readonly number[] = Object.values(COUNTER_HEIGHT_TARGETS_MM);
    if (!known.includes(counterHeight)) {
      warnings.push({
        code: 'COUNTER_HEIGHT_OFF_PUBLISHED_LIST',
        message:
          `Counter height ${counterHeight}mm is not a JIS A0017:2018 worktop height ` +
          `(${JIS_A0017_2018.worktopHeightsMm.join('/')}) nor a market target in ` +
          `COUNTER_HEIGHT_TARGETS_MM (${known.join('/')}).`,
      });
    }
  }

  // Can the specified worktop actually be built from the catalog? The target is a
  // specification; this is the reality check against it, and it is a WARNING rather than
  // an error because a 0.4mm shortfall is absorbed by the adjustable leg — see below.
  const gap = findClosestBuildableWorktop(worktopThickness);
  if (!gap.exact) {
    warnings.push({
      code: 'WORKTOP_TARGET_NOT_IN_CATALOG',
      message:
        `Target worktop thickness ${worktopThickness.toFixed(1)}mm cannot be built from this ` +
        `catalog. The closest buildable moisture-resistant, bandable slab is ` +
        `${gap.closestAchievableMm.toFixed(1)}mm (${gap.coreMaterialId} + 2 x ` +
        `${gap.surfaceMaterialId}), a ${gap.deltaMm > 0 ? '+' : ''}${gap.deltaMm.toFixed(1)}mm ` +
        `difference. NOT substituted automatically: changing the surface material to chase ` +
        `thickness would change the finish and the quoted cost of every slab. Either source a ` +
        `material that hits ${worktopThickness.toFixed(1)}mm, or accept the ` +
        `${Math.abs(gap.deltaMm).toFixed(1)}mm and absorb it in the leg — a ` +
        `${gap.closestAchievableMm.toFixed(1)}mm slab needs a ` +
        `${(counterHeight - carcassHeight - gap.closestAchievableMm).toFixed(1)}mm plinth to ` +
        `still reach ${counterHeight}mm.`,
    });
  }

  return {
    counterHeight,
    carcassHeight,
    worktopThickness,
    plinthHeight,
    onPublishedRung,
    matchedRungStandards,
    leg,
    legReachability,
    levelling,
    buildable: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Throw unless the stack is buildable.
 *
 * `deriveHeightStack` is deliberately total — it always returns a stack, so a UI can show
 * a bad configuration and explain it. This is the gate for anything that would commit the
 * configuration to a cut list, a quote or a packet, where an unbuildable stack must stop
 * the line rather than be rendered.
 */
export function assertBuildableHeightStack(stack: HeightStack, context = 'height stack'): void {
  if (stack.buildable) return;
  throw new Error(
    `UNBUILDABLE ${context}: ${stack.counterHeight}mm counter = ${stack.plinthHeight.toFixed(1)}mm ` +
      `plinth + ${stack.carcassHeight}mm carcass + ${stack.worktopThickness.toFixed(1)}mm worktop. ` +
      stack.errors.map((e) => `[${e.code}] ${e.message}`).join(' ')
  );
}

/**
 * The default (Thai) height stack, resolved once at module load. OWNER-CONFIRMED.
 *
 *     850 counter - 760 carcass - 20 worktop = 70 mm plinth = the leg's MINIMUM
 *
 * Every term here is the stated practice of the kitchen business this system is built
 * for, and that outranks every published document. A previous 15-agent audit of an
 * 11-document corpus derived 100 + 720 + 30 = 850 from published sources; that arithmetic
 * is internally consistent but describes EUROPEAN component sizes, not this business. The
 * owner's numbers win. See MARKET_HEIGHT_PROFILES, where the European stack is kept as
 * its own profile rather than being allowed to overwrite the Thai one.
 *
 * THE LOAD-BEARING PROPERTY: the plinth lands on exactly 70mm, which is the wound-fully-
 * down height of the Thai adjustable leg. That is not a coincidence to be rounded away —
 * it means a perfectly flat floor is the LOWER BOUND of this configuration and 100% of
 * the leg's adjustment is headroom for an uneven floor. `levelling.shortenHeadroom` is
 * 0.0mm and the stack says so out loud (NO_LEVELLING_HEADROOM_DOWNWARD).
 *
 * 70 is not a published JIS or next125 rung, and that is expected rather than alarming:
 * those rung tables are generated by JIS's own B = A - 750 rule, which assumes a 750mm
 * carcass-plus-worktop assembly. This business builds 760 + 20 = 780mm. A 30mm-taller
 * assembly under the same 850mm counter necessarily yields a 30mm-shorter plinth, and the
 * hardware that makes that work is a shorter leg — which is precisely the leg the owner
 * buys. The off-rung warning is retained as information, not as a defect.
 *
 * KNOWN OPEN GAP: the 20mm worktop is a target this catalog cannot currently build; the
 * closest is 19.6mm. See DEFAULT_WORKTOP_THICKNESS_GAP. The 0.4mm is absorbed by winding
 * the legs up 0.4mm (to 70.4mm), which is inside the adjustment range — the levelling
 * tolerance doing exactly the job it exists for.
 */
export const DEFAULT_HEIGHT_STACK: HeightStack = deriveHeightStack();

/**
 * A complete, named height configuration for one market.
 *
 * STEP 5's point: the stack must be genuinely configurable, not Thai-hardcoded with a
 * `counterHeight` parameter bolted on. A market differs in its carcass and worktop and
 * leg too, not only in the finished height it is aiming at.
 */
export interface MarketHeightProfile {
  readonly market: CounterHeightMarket;
  readonly counterHeight: number;
  readonly carcassHeight: number;
  readonly worktopThickness: number;
  readonly leg: PlinthLeg;
  readonly provenance: LegProvenance;
  readonly note: string;
}

/**
 * TH and EU as first-class, side-by-side configurations.
 *
 * THAI — 850 = 70 + 760 + 20. Owner-confirmed, and the product default.
 *
 * EUROPEAN — 900 = 150 + 720 + 30. This is the stack the document audit derived, kept
 * here in the one place it is actually correct. 150mm IS a published plinth rung on both
 * JIS A0017:2018 and next125, and 720 + 30 = 750 is exactly the assembly JIS's B = A - 750
 * rule assumes — so the European profile lands on a published rung by construction while
 * the Thai one does not. That contrast is the clearest possible evidence that the two are
 * genuinely different systems and that neither is a corruption of the other.
 *
 * EU LEG, STATED NOT FUDGED: the EU profile is listed against the Thai 70mm leg because
 * it is the only leg in the catalog. A real European kitchen uses a European leg SKU
 * (100-150mm ranges are typical) which nobody has sourced for this project. The 150mm EU
 * plinth clears the Thai leg's 70mm minimum, so the profile validates — but it validates
 * against the wrong hardware, and `provenance: 'UNSOURCED'` records that.
 */
export const MARKET_HEIGHT_PROFILES: Readonly<Record<'TH' | 'EU', MarketHeightProfile>> = {
  TH: {
    market: 'TH',
    counterHeight: COUNTER_HEIGHT_TARGETS_MM.TH,
    carcassHeight: 760,
    worktopThickness: 20,
    leg: DEFAULT_PLINTH_LEG,
    provenance: 'OWNER_CONFIRMED',
    note: '850 = 70 leg + 760 carcass + 20 worktop. Stated by the business owner.',
  },
  EU: {
    market: 'EU',
    counterHeight: COUNTER_HEIGHT_TARGETS_MM.EU,
    carcassHeight: 720,
    worktopThickness: 30,
    leg: DEFAULT_PLINTH_LEG,
    provenance: 'UNSOURCED',
    note:
      '900 = 150 plinth + 720 carcass + 30 worktop. Published European practice; 150 is a ' +
      'JIS A0017:2018 and next125 rung. Leg SKU is NOT sourced for this market — the Thai ' +
      '70mm leg is used as a stand-in and only its lower bound is meaningful here.',
  },
};

/** Resolve a market profile into a validated height stack. */
export function deriveMarketHeightStack(profile: MarketHeightProfile): HeightStack {
  return deriveHeightStack({
    counterHeight: profile.counterHeight,
    carcassHeight: profile.carcassHeight,
    worktopThickness: profile.worktopThickness,
    leg: profile.leg,
  });
}

/**
 * THE single toe-kick / plinth height. Every cabinet type, DEFAULT_DIMENSIONS and the
 * designer policy default point here.
 *
 * It was previously written as the literal `100` in ELEVEN places (verified by grep: nine
 * cabinet-type definitions in this file, plus DEFAULT_DIMENSIONS in types/Cabinet.ts and
 * createDefaultIntent in designer/policy.ts). Eleven literals is eleven chances to update
 * ten of them and ship a kitchen whose cabinets stand at two different heights in the
 * same run. All eleven now read this constant; the literal appears nowhere in src/.
 */
export const DEFAULT_TOE_KICK_HEIGHT_MM: number = DEFAULT_HEIGHT_STACK.plinthHeight;

/**
 * Surface height-stack warnings on the console once per process.
 *
 * Runtime warning is a requirement, not a nicety: a derived plinth that is not a
 * purchasable rung is a real procurement problem and it must not be discoverable only
 * by reading source.
 */
export function reportHeightStackWarnings(
  stack: HeightStack,
  label: string,
  sink: (message: string) => void = console.warn
): void {
  // Errors first, and labelled UNBUILDABLE, so a hard failure is never buried under
  // advisory noise in a console.
  for (const e of stack.errors) {
    sink(`[MONOLITH height stack: ${label}] UNBUILDABLE ${e.code}: ${e.message}`);
  }
  for (const w of stack.warnings) {
    sink(`[MONOLITH height stack: ${label}] ${w.code}: ${w.message}`);
  }
}

reportHeightStackWarnings(DEFAULT_HEIGHT_STACK, `default (counter ${DEFAULT_COUNTER_HEIGHT_MM}mm)`);

// ============================================
// DIMENSIONAL STANDARDS
// ============================================

export interface DimensionalStandard {
  min: number;
  max: number;
  default: number;
  /**
   * Increment step, mm.
   *
   * OPTIONAL, and deliberately ABSENT wherever `discrete` exists. A step is a claim
   * that every value on the grid is real, and for cabinet widths that claim was false:
   * a 50 mm step advertises 650/750/850 mm, which no manufacturer offers and no
   * appliance fits. Where a real catalogue is a discrete list, say so; do not
   * approximate it with a grid.
   */
  step?: number;
  /**
   * The exact set of catalogue values, mm. When present this — not `step` — is the
   * authority on which values are real. Values outside it are WARNED on, not rejected,
   * because bespoke widths (fillers, end panels, scribes) are legitimate; they are just
   * not catalogue items and should not be picked by accident.
   */
  discrete?: readonly number[];
}

export interface CabinetStandards {
  width: DimensionalStandard;
  height: DimensionalStandard;
  depth: DimensionalStandard;
}

/**
 * Cabinet widths as a DISCRETE SET, mm.
 *
 * Every real catalogue is a list, not an arithmetic progression. The previous
 * `step: 50` permitted 650/750/850 — widths no manufacturer offers, and into which no
 * standard appliance fits.
 */
export const CABINET_WIDTH_SET_MM: readonly number[] = [
  300, 400, 450, 500, 600, 800, 900, 1000, 1200,
];

/**
 * Base / tall carcass depths, mm.
 *
 * - 600 — Thai sources, JIS A0017:2018, AU. The new default.
 * - 560 — retained as a shallow/UK profile. Note JIS does NOT list it.
 * - 610 — US (24 in).
 * - 650 — deep/JP profile; JIS lists it.
 */
export const BASE_DEPTH_SET_MM: readonly number[] = [560, 600, 610, 650];

/**
 * Wall cabinet depths, mm. 300 is Thai/UK/US practice and the new default;
 * 330/350/370 are real alternatives (370 is IKEA METOD).
 *
 * 320 — the previous default — appears exactly ONCE in the entire sourced corpus, as a
 * private Boffi option. It was never a general-purpose default.
 */
export const WALL_DEPTH_SET_MM: readonly number[] = [300, 330, 350, 370];

/**
 * Real wall depths that EXCEED the JIS A0017:2018 400 mm ceiling, mm.
 *
 * UNRESOLVED SOURCE CONFLICT, recorded rather than silently decided: 410 mm is a real
 * Poliform wall-unit depth, and JIS A0017:2018 caps wall units at 400 mm. Both are
 * sourced; they disagree. This module enforces the JIS ceiling (the conservative,
 * head-clearance-driven choice) and keeps 410 here so the conflict is visible and
 * `validateDimensions` can explain the rejection instead of just failing a bound.
 * A human should decide whether a non-JIS market profile is wanted.
 */
export const WALL_DEPTHS_EXCEEDING_JIS_CEILING_MM: readonly number[] = [410];

/** Minimum carcass depth for any cabinet housing an oven, mm. */
export const OVEN_HOUSING_MIN_DEPTH_MM = 560;

/** Build a width standard whose discrete set is CABINET_WIDTH_SET_MM clipped to range. */
function widthStandard(min: number, max: number, defaultWidth: number): DimensionalStandard {
  return {
    min,
    max,
    default: defaultWidth,
    discrete: CABINET_WIDTH_SET_MM.filter((w) => w >= min && w <= max),
  };
}

/** Build a depth standard from an explicit catalogue set clipped to range. */
function depthStandard(
  min: number,
  max: number,
  defaultDepth: number,
  set: readonly number[]
): DimensionalStandard {
  return {
    min,
    max,
    default: defaultDepth,
    discrete: set.filter((d) => d >= min && d <= max),
  };
}

/**
 * Base Cabinet Standards (ตู้ล่าง)
 *
 * Height: 760mm carcass, OWNER-CONFIRMED for the Thai market. NOT the 720 that European
 *   sources publish and that this file previously used — see DEFAULT_CARCASS_HEIGHT_MM.
 *   The finished counter height is NOT this number plus invented terms — it is DERIVED.
 *   See DEFAULT_HEIGHT_STACK:
 *     counter 850 (TH) = 70 plinth + 760 carcass + 20 worktop.
 *   The old comment here read "counter height 900mm = 720 + 100 toe + 40 countertop +
 *   40 clearance". That sums to 860, not 900, and the "+40 clearance" term corresponded
 *   to no geometry anywhere in this codebase — it existed only to make the arithmetic
 *   appear to reach 900. It is deleted.
 * Depth: 600mm default (Thai/JIS/AU); 560 shallow/UK, 610 US, 650 deep/JP.
 * Width: discrete catalogue set, not a 50mm grid.
 */
export const BASE_CABINET_STANDARDS: CabinetStandards = {
  width: widthStandard(300, 1200, 600),
  height: { min: 680, max: 900, default: DEFAULT_CARCASS_HEIGHT_MM, step: 20 },
  depth: depthStandard(500, 650, 600, BASE_DEPTH_SET_MM),
};

/**
 * Wall Cabinet Standards (ตู้ลอย)
 *
 * Height: 300-900mm (varies by style)
 * Depth: 300mm default. Hard ceiling 400mm — JIS A0017:2018 wallUnitMaxDepthMm, a
 *   head-clearance limit over a worktop.
 * Width: discrete catalogue set.
 *
 * ERGONOMIC NOTES:
 * - Floor to wall-unit underside: JIS A0017:2018 minimum is 1300mm; MONOLITH derives
 *   ERGONOMIC_STANDARDS.wallCabinetBottom = counter 850 + backsplash 450 = 1300, which
 *   lands exactly on that minimum.
 * - Gap between worktop and wall unit: 450mm (backsplash zone).
 */
export const WALL_CABINET_STANDARDS: CabinetStandards = {
  width: widthStandard(300, 1200, 600),
  height: { min: 300, max: 900, default: 720, step: 50 },
  depth: depthStandard(250, JIS_A0017_2018.wallUnitMaxDepthMm, 300, WALL_DEPTH_SET_MM),
};

/**
 * Tall Cabinet Standards (ตู้สูง/ตู้ Pantry)
 *
 * Height: 1800-3000mm. The 3000 ceiling replaces 2400, which could not express the
 *   2710-2980mm tier of the stated benchmark brand.
 * Depth: matches base cabinets (600 default).
 * Width: discrete catalogue set clipped to 450-900.
 *
 * NO SOURCED DISCRETE SET EXISTS for tall-unit height, so `step` is retained here and
 * NOT replaced by a `discrete` list. Inventing rungs to match the width treatment would
 * be exactly the fabrication this work exists to remove. Flagged for sourcing.
 */
export const TALL_CABINET_STANDARDS: CabinetStandards = {
  width: widthStandard(450, 900, 600),
  height: { min: 1800, max: 3000, default: 2200, step: 100 },
  depth: depthStandard(500, 650, 600, BASE_DEPTH_SET_MM),
};

/**
 * Corner Cabinet Standards (ตู้เข้ามุม)
 *
 * Width/Depth: Equal on both sides for true corner
 * Blind corner: 900mm face + 300-450mm blind
 */
export const CORNER_CABINET_STANDARDS: CabinetStandards = {
  width: widthStandard(800, 1200, 900),
  height: { min: 680, max: 900, default: DEFAULT_CARCASS_HEIGHT_MM, step: 20 },
  depth: widthStandard(800, 1200, 900),
};

// ============================================
// CABINET TYPE DEFINITIONS
// ============================================

export interface CabinetTypeDefinition {
  id: string;
  category: CabinetCategory;
  name: string;
  nameTH: string;
  description: string;
  standards: CabinetStandards;

  // Component configuration
  defaultShelfCount: number;
  hasToeKick: boolean;
  toeKickHeight?: number;
  hasBack: boolean;

  // Joint defaults
  defaultTopJoint: 'INSET' | 'OVERLAY';
  defaultBottomJoint: 'INSET' | 'OVERLAY';

  // Special features
  features?: string[];
}

/**
 * Complete Cabinet Type Catalog
 */
export const CABINET_TYPES: Record<string, CabinetTypeDefinition> = {

  // ============================================
  // BASE CABINETS (ตู้ล่าง)
  // ============================================

  BASE_STANDARD: {
    id: 'BASE_STANDARD',
    category: 'BASE',
    name: 'Standard Base Cabinet',
    nameTH: 'ตู้ล่างมาตรฐาน',
    description: 'Standard base cabinet with adjustable shelf',
    standards: BASE_CABINET_STANDARDS,
    defaultShelfCount: 1,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['adjustable-shelf', 'soft-close-door'],
  },

  BASE_DRAWER: {
    id: 'BASE_DRAWER',
    category: 'BASE',
    name: 'Drawer Base Cabinet',
    nameTH: 'ตู้ล่างลิ้นชัก',
    description: 'Base cabinet with drawers instead of doors',
    standards: BASE_CABINET_STANDARDS,
    defaultShelfCount: 0,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['drawer-system', 'soft-close-drawer'],
  },

  BASE_SINK: {
    id: 'BASE_SINK',
    category: 'BASE',
    name: 'Sink Base Cabinet',
    nameTH: 'ตู้ล่างอ่างล้าง',
    description: 'Base cabinet for sink installation (no shelf, false bottom)',
    standards: {
      ...BASE_CABINET_STANDARDS,
      width: widthStandard(600, 1200, 800),
    },
    defaultShelfCount: 0,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['sink-cutout', 'plumbing-access', 'false-bottom'],
  },

  // ============================================
  // WALL CABINETS (ตู้ลอย)
  // ============================================

  WALL_STANDARD: {
    id: 'WALL_STANDARD',
    category: 'WALL',
    name: 'Standard Wall Cabinet',
    nameTH: 'ตู้ลอยมาตรฐาน',
    description: 'Standard wall-mounted cabinet',
    standards: WALL_CABINET_STANDARDS,
    defaultShelfCount: 2,
    hasToeKick: false,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['adjustable-shelf', 'soft-close-door', 'wall-mount'],
  },

  WALL_HOOD: {
    id: 'WALL_HOOD',
    category: 'WALL',
    name: 'Hood Surround Cabinet',
    nameTH: 'ตู้คลุมเครื่องดูดควัน',
    description: 'Cabinet surrounding range hood',
    standards: {
      ...WALL_CABINET_STANDARDS,
      width: widthStandard(600, 900, 600),
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,  // Open back for hood vent
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['hood-opening', 'vent-access'],
  },

  WALL_OPEN: {
    id: 'WALL_OPEN',
    category: 'WALL',
    name: 'Open Shelf Cabinet',
    nameTH: 'ตู้ลอยเปิดโล่ง',
    description: 'Wall cabinet without doors (open shelving)',
    standards: WALL_CABINET_STANDARDS,
    defaultShelfCount: 2,
    hasToeKick: false,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['open-front', 'adjustable-shelf'],
  },

  // ============================================
  // TALL CABINETS (ตู้สูง)
  // ============================================

  TALL_PANTRY: {
    id: 'TALL_PANTRY',
    category: 'TALL',
    name: 'Pantry Cabinet',
    nameTH: 'ตู้ Pantry',
    description: 'Full-height storage cabinet with multiple shelves',
    standards: TALL_CABINET_STANDARDS,
    defaultShelfCount: 5,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['adjustable-shelf', 'pull-out-tray'],
  },

  TALL_BROOM: {
    id: 'TALL_BROOM',
    category: 'TALL',
    name: 'Broom Cabinet',
    nameTH: 'ตู้เก็บไม้กวาด',
    description: 'Tall narrow cabinet for cleaning supplies',
    standards: {
      ...TALL_CABINET_STANDARDS,
      width: widthStandard(300, 600, 450),
    },
    defaultShelfCount: 2,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['broom-hooks', 'adjustable-shelf'],
  },

  // ============================================
  // CORNER CABINETS (ตู้เข้ามุม)
  // ============================================

  CORNER_BLIND: {
    id: 'CORNER_BLIND',
    category: 'CORNER',
    name: 'Blind Corner Cabinet',
    nameTH: 'ตู้มุมตาบอด',
    description: 'Corner cabinet with blind side (accessible from one direction)',
    standards: CORNER_CABINET_STANDARDS,
    defaultShelfCount: 1,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['blind-side', 'pull-out-insert'],
  },

  CORNER_DIAGONAL: {
    id: 'CORNER_DIAGONAL',
    category: 'CORNER',
    name: 'Diagonal Corner Cabinet',
    nameTH: 'ตู้มุมเฉียง 45 องศา',
    description: '45-degree corner cabinet with angled front',
    standards: CORNER_CABINET_STANDARDS,
    defaultShelfCount: 2,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: true,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['diagonal-door', 'lazy-susan'],
  },

  CORNER_LAZY_SUSAN: {
    id: 'CORNER_LAZY_SUSAN',
    category: 'CORNER',
    name: 'Lazy Susan Corner Cabinet',
    nameTH: 'ตู้มุมถาดหมุน',
    description: 'L-shaped corner with rotating shelves',
    standards: CORNER_CABINET_STANDARDS,
    defaultShelfCount: 0,  // Uses rotating trays instead
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: false,  // Open for mechanism
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['lazy-susan', 'bi-fold-doors'],
  },

  // ============================================
  // APPLIANCE CABINETS (ตู้สำหรับอุปกรณ์)
  // ============================================

  APPLIANCE_OVEN: {
    id: 'APPLIANCE_OVEN',
    category: 'APPLIANCE',
    name: 'Built-in Oven Cabinet',
    nameTH: 'ตู้เตาอบ Built-in',
    description: 'Cabinet for built-in oven with ventilation',
    standards: {
      // Width/height stay on a fine step: these are APPLIANCE apertures sized to the
      // machine, not catalogue cabinet sizes, so a discrete carcass set does not apply.
      width: { min: 560, max: 650, default: 600, step: 10 },
      height: { min: 600, max: 900, default: DEFAULT_CARCASS_HEIGHT_MM, step: 10 },
      // OVEN DEPTH FLOOR: min raised 550 -> 560 (OVEN_HOUSING_MIN_DEPTH_MM). A built-in
      // oven is ~550 deep and VENTILATION_REQUIREMENTS.OVEN demands 50mm behind it; a
      // 550 housing cannot hold both. Default follows the new 600 base depth so the
      // oven housing sits flush in the run instead of standing 40mm proud.
      depth: depthStandard(OVEN_HOUSING_MIN_DEPTH_MM, 650, 600, BASE_DEPTH_SET_MM),
    },
    defaultShelfCount: 0,
    hasToeKick: true,
    toeKickHeight: DEFAULT_TOE_KICK_HEIGHT_MM,
    hasBack: false,  // Ventilation
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-opening', 'heat-resistant', 'ventilation-slots'],
  },

  APPLIANCE_MICROWAVE: {
    id: 'APPLIANCE_MICROWAVE',
    category: 'APPLIANCE',
    name: 'Microwave Cabinet',
    nameTH: 'ตู้ไมโครเวฟ',
    description: 'Cabinet for microwave with ventilation',
    standards: {
      width: { min: 500, max: 700, default: 600, step: 50 },
      height: { min: 350, max: 450, default: 400, step: 25 },
      depth: { min: 350, max: 450, default: 400, step: 25 },
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,  // Ventilation
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-opening', 'ventilation-slots'],
  },

  APPLIANCE_REFRIGERATOR: {
    id: 'APPLIANCE_REFRIGERATOR',
    category: 'APPLIANCE',
    name: 'Refrigerator Surround',
    nameTH: 'ตู้คลุมตู้เย็น',
    description: 'Surround panels for built-in refrigerator look',
    standards: {
      width: widthStandard(600, 1000, 900),
      height: { min: 1800, max: 2400, default: 2200, step: 100 },
      /**
       * RUN-FACE STEP, REPORTED NOT SILENTLY CHANGED: this surround stays 650mm deep
       * because 650 is a real depth for a domestic fridge plus its 50mm rear vent
       * clearance (VENTILATION_REQUIREMENTS.REFRIGERATOR). Against the new 600mm base
       * default it therefore stands 50mm PROUD of the run face.
       *
       * That is an improvement, not a regression: against the old 560mm base default
       * the same 650 stood 90mm proud. Nobody had written that down.
       *
       * 50mm proud is a real joinery condition (a fridge housing commonly does stand
       * forward, and the worktop deriver already handles mixed depth by taking the
       * deepest member of a run). Reducing it further needs a sourced shallow-fridge
       * depth, which is not available here, so it is left at 650 and documented.
       */
      depth: { min: 600, max: 700, default: 650, step: 25 },
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-surround', 'top-cabinet-space', 'ventilation'],
  },

  APPLIANCE_WASHER: {
    id: 'APPLIANCE_WASHER',
    category: 'APPLIANCE',
    name: 'Washer/Dryer Cabinet',
    nameTH: 'ตู้เครื่องซักผ้า',
    description: 'Cabinet housing for front-load washer/dryer',
    standards: {
      width: { min: 600, max: 700, default: 650, step: 25 },
      height: { min: 850, max: 1000, default: 900, step: 50 },
      depth: { min: 600, max: 700, default: 650, step: 25 },
    },
    defaultShelfCount: 0,
    hasToeKick: false,
    hasBack: false,  // Plumbing/ventilation access
    defaultTopJoint: 'INSET',
    defaultBottomJoint: 'INSET',
    features: ['appliance-opening', 'plumbing-access', 'vibration-dampening'],
  },
};

// ============================================
// ERGONOMIC GUIDELINES
// ============================================

export interface ErgonomicGuidelines {
  counterHeight: number;           // Standard counter height from floor
  backsplashHeight: number;        // Height of backsplash zone
  wallCabinetBottom: number;       // Min height of wall cabinet bottom from floor
  reachableShelfMax: number;       // Max comfortable reach height
  kneeSpace: number;               // Space for sitting/wheelchair
}

/**
 * PHANTOM TERM DELETED.
 *
 * This block used to declare `counterHeight: 900` with the comment
 * "900mm = 720 base + 100 toe + 40 counter + 40 clearance". Three things were wrong:
 *   1. Those terms sum to 860, not 900.
 *   2. The "+40 clearance" term corresponded to NO GEOMETRY ANYWHERE in this codebase.
 *      It existed solely to make the arithmetic appear to reach the declared 900.
 *   3. What MONOLITH actually built was 100 toe + 720 carcass + 18.6 slab = 838.6mm —
 *      61.4mm below its own declared target, and below Thai 850, EU/UK 870-910, AU 900
 *      and US 914.
 *
 * counterHeight is now the height stack's INPUT (Thai default 850) and everything that
 * used to be asserted about it is derived. See DEFAULT_HEIGHT_STACK.
 */
export const ERGONOMIC_STANDARDS: ErgonomicGuidelines = {
  // Finished floor-to-worktop-top. Thai default; a tenant targeting the EU passes 900.
  counterHeight: DEFAULT_COUNTER_HEIGHT_MM,
  // Worktop to wall-unit underside (backsplash zone).
  backsplashHeight: 450,
  // DERIVED, not asserted: 850 + 450 = 1300, which lands exactly on the JIS A0017:2018
  // wall-unit minimum underside. The previous hardcoded 1350 was inconsistent with its
  // own neighbours (900 + 450 = 1350 only held against the counter height this file
  // declared but never built).
  wallCabinetBottom: DEFAULT_COUNTER_HEIGHT_MM + 450,
  reachableShelfMax: 1900,         // Max comfortable reach without stool
  kneeSpace: 600,                  // For wheelchair accessibility (ADA)
};

// ============================================
// VENTILATION REQUIREMENTS
// ============================================

export interface VentilationRequirement {
  applianceType: ApplianceType;
  minClearanceTop: number;         // mm above appliance
  minClearanceBack: number;        // mm behind appliance
  minClearanceSides: number;       // mm on each side
  requiresBackVent: boolean;
  requiresBottomVent: boolean;
  ventSlotArea?: number;           // Required vent area in cm²
}

export const VENTILATION_REQUIREMENTS: Record<ApplianceType, VentilationRequirement> = {
  OVEN: {
    applianceType: 'OVEN',
    minClearanceTop: 50,
    minClearanceBack: 50,
    minClearanceSides: 5,
    requiresBackVent: true,
    requiresBottomVent: false,
    ventSlotArea: 200,
  },
  MICROWAVE: {
    applianceType: 'MICROWAVE',
    minClearanceTop: 30,
    minClearanceBack: 50,
    minClearanceSides: 25,
    requiresBackVent: true,
    requiresBottomVent: false,
    ventSlotArea: 100,
  },
  REFRIGERATOR: {
    applianceType: 'REFRIGERATOR',
    minClearanceTop: 50,
    minClearanceBack: 50,
    minClearanceSides: 10,
    requiresBackVent: true,
    requiresBottomVent: true,
    ventSlotArea: 400,
  },
  DISHWASHER: {
    applianceType: 'DISHWASHER',
    minClearanceTop: 5,
    minClearanceBack: 50,
    minClearanceSides: 5,
    requiresBackVent: false,
    requiresBottomVent: false,
  },
  WASHER: {
    applianceType: 'WASHER',
    minClearanceTop: 25,
    minClearanceBack: 100,
    minClearanceSides: 25,
    requiresBackVent: true,
    requiresBottomVent: false,
    ventSlotArea: 150,
  },
  HOOD: {
    applianceType: 'HOOD',
    minClearanceTop: 50,
    minClearanceBack: 0,
    minClearanceSides: 0,
    requiresBackVent: true,
    requiresBottomVent: false,
  },
};

// ============================================
// CORNER CABINET ALGORITHMS
// ============================================

export interface CornerCabinetParams {
  type: CornerType;
  width: number;               // Face width
  depth: number;               // Depth into corner
  blindOverlap?: number;       // For blind corners
}

/**
 * Calculate Blind Corner Cabinet Dimensions
 *
 * @param faceWidth - Visible face width (typically 900mm)
 * @param blindOverlap - How much cabinet extends past adjacent cabinet (300-450mm)
 * @param depth - Cabinet depth (560mm standard)
 * @returns Panel dimensions for blind corner
 */
export function calculateBlindCorner(
  faceWidth: number = 900,
  blindOverlap: number = 300,
  depth: number = 560
): { totalWidth: number; openingWidth: number; fillerNeeded: number } {
  const totalWidth = faceWidth;
  const openingWidth = faceWidth - blindOverlap;
  const fillerNeeded = blindOverlap + 75; // Standard filler for pull clearance

  return {
    totalWidth,
    openingWidth,
    fillerNeeded,
  };
}

/**
 * Calculate Diagonal Corner Cabinet (45-degree)
 *
 * @param wallToCorner - Distance from wall to corner point
 * @returns Diagonal cabinet dimensions
 */
export function calculateDiagonalCorner(
  wallToCorner: number = 600
): { faceWidth: number; diagonalDepth: number; openingWidth: number } {
  // 45-degree corner: face is at 45 degrees to walls
  // Face width = wallToCorner * sqrt(2)
  const faceWidth = Math.round(wallToCorner * Math.SQRT2);
  const diagonalDepth = wallToCorner;
  const openingWidth = faceWidth - 100; // Door frame allowance

  return {
    faceWidth,
    diagonalDepth,
    openingWidth,
  };
}

/**
 * Calculate Lazy Susan Corner Space
 *
 * @param cabinetWidth - Both sides equal for true corner
 * @param trayDiameter - Lazy susan tray diameter
 * @returns Usable rotating space
 */
export function calculateLazySusanSpace(
  cabinetWidth: number = 900,
  trayDiameter?: number
): { maxTrayDiameter: number; recommendedTray: number; deadCornerSize: number } {
  // Max tray = diagonal of inner corner - clearance
  // Inner corner diagonal = (W - 2*thickness) * sqrt(2)
  const innerWidth = cabinetWidth - 36; // 18mm panels each side
  const maxDiagonal = innerWidth * Math.SQRT2;
  const maxTrayDiameter = Math.floor(maxDiagonal - 50); // 50mm clearance

  // Standard tray sizes: 400, 500, 600, 700, 800mm
  const standardSizes = [400, 500, 600, 700, 800];
  const recommendedTray = standardSizes
    .filter(s => s <= maxTrayDiameter)
    .pop() || 400;

  // Dead corner = space not covered by rotating tray
  const deadCornerSize = Math.round((innerWidth - recommendedTray / 2) * 0.3);

  return {
    maxTrayDiameter,
    recommendedTray,
    deadCornerSize,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get cabinet type by ID
 */
export function getCabinetType(id: string): CabinetTypeDefinition | undefined {
  return CABINET_TYPES[id];
}

/**
 * Get all cabinet types by category
 */
export function getCabinetsByCategory(category: CabinetCategory): CabinetTypeDefinition[] {
  return Object.values(CABINET_TYPES).filter(c => c.category === category);
}

/**
 * Validate dimensions against standards.
 *
 * TWO SEVERITIES, on purpose:
 * - ERRORS are hard bounds (min/max). Exceeding one produces something that cannot be
 *   built or installed — e.g. a wall unit deeper than the JIS A0017:2018 400mm ceiling,
 *   or an oven housing too shallow to hold the oven plus its mandated rear vent gap.
 * - WARNINGS are off-catalogue values. A 650mm-wide base is buildable, it is just not
 *   a size any manufacturer offers and no appliance fits it. Bespoke widths (fillers,
 *   end panels, scribes) are legitimate, so these must not block — but picking one by
 *   accident, which a 50mm `step` actively encouraged, must be visible.
 *
 * `warnings` is additive; existing `{ valid, errors }` consumers are unaffected.
 */
export function validateDimensions(
  typeId: string,
  width: number,
  height: number,
  depth: number
): { valid: boolean; errors: string[]; warnings: string[] } {
  const type = CABINET_TYPES[typeId];
  if (!type) {
    return { valid: false, errors: [`Unknown cabinet type: ${typeId}`], warnings: [] };
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const { standards } = type;

  if (width < standards.width.min || width > standards.width.max) {
    errors.push(`Width ${width}mm outside range ${standards.width.min}-${standards.width.max}mm`);
  }
  if (height < standards.height.min || height > standards.height.max) {
    errors.push(`Height ${height}mm outside range ${standards.height.min}-${standards.height.max}mm`);
  }
  if (depth < standards.depth.min || depth > standards.depth.max) {
    errors.push(`Depth ${depth}mm outside range ${standards.depth.min}-${standards.depth.max}mm`);

    // Explain the two hard bounds that are standards-derived rather than arbitrary,
    // so a rejection is actionable instead of just a failed comparison.
    if (type.category === 'WALL' && depth > JIS_A0017_2018.wallUnitMaxDepthMm) {
      const isRealButNonJis = WALL_DEPTHS_EXCEEDING_JIS_CEILING_MM.includes(depth);
      errors.push(
        `Wall unit depth ${depth}mm exceeds the JIS A0017:2018 ceiling of ` +
          `${JIS_A0017_2018.wallUnitMaxDepthMm}mm (head clearance over the worktop).` +
          (isRealButNonJis
            ? ` NOTE: ${depth}mm is a real published depth (Poliform), so this is a genuine ` +
              `conflict between two sourced standards, not a typo. MONOLITH enforces the JIS ` +
              `ceiling; adopting the deeper profile is a human decision.`
            : '')
      );
    }
    if (depth < OVEN_HOUSING_MIN_DEPTH_MM && housesAnOven(type)) {
      errors.push(
        `Oven housing depth ${depth}mm is below the ${OVEN_HOUSING_MIN_DEPTH_MM}mm floor: a ` +
          `built-in oven plus its ${VENTILATION_REQUIREMENTS.OVEN.minClearanceBack}mm rear ` +
          `vent clearance does not fit.`
      );
    }
  }

  // Off-catalogue (non-blocking).
  const offSet = (label: string, value: number, std: DimensionalStandard) => {
    if (std.discrete && !std.discrete.includes(value)) {
      warnings.push(
        `${label} ${value}mm is not a catalogue size for ${typeId} ` +
          `(${std.discrete.join('/')}mm). Buildable, but bespoke.`
      );
    }
  };
  offSet('Width', width, standards.width);
  offSet('Height', height, standards.height);
  offSet('Depth', depth, standards.depth);

  return { valid: errors.length === 0, errors, warnings };
}

/** Whether this cabinet type houses an oven, and so carries the depth floor. */
function housesAnOven(type: CabinetTypeDefinition): boolean {
  return type.id === 'APPLIANCE_OVEN';
}

/**
 * Get ventilation requirements for appliance cabinet
 */
export function getVentilationRequirements(applianceType: ApplianceType): VentilationRequirement {
  return VENTILATION_REQUIREMENTS[applianceType];
}

/**
 * Calculate appliance cabinet inner dimensions
 */
export function calculateApplianceOpening(
  applianceType: ApplianceType,
  applianceWidth: number,
  applianceHeight: number,
  applianceDepth: number
): {
  cabinetWidth: number;
  cabinetHeight: number;
  cabinetDepth: number;
  openingWidth: number;
  openingHeight: number;
} {
  const vent = VENTILATION_REQUIREMENTS[applianceType];
  const panelThickness = 18; // Standard panel thickness

  const openingWidth = applianceWidth + (vent.minClearanceSides * 2);
  const openingHeight = applianceHeight + vent.minClearanceTop;

  return {
    cabinetWidth: openingWidth + (panelThickness * 2),
    cabinetHeight: openingHeight + panelThickness, // Top panel only
    cabinetDepth: applianceDepth + vent.minClearanceBack,
    openingWidth,
    openingHeight,
  };
}
