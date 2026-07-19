/**
 * handleCatalog.ts - Purchasable handle hardware.
 *
 * A handle is BOUGHT hardware, never a cut panel. It has no PanelRole, it never
 * reaches the cut list or the DXF, and it enters the BOM as a hardware line with
 * a real quantity and a real price.
 *
 * This file is the single source of truth for both the 3D mesh and the BOM line,
 * so the picture on screen and the number on the quote cannot drift apart.
 *
 * PRICE PROVENANCE — READ BEFORE QUOTING.
 * The THB figures below are indicative Thai-market list prices for the class of
 * part described, entered so that no handle can ever reach the BOM at zero cost.
 * They are NOT a quotation from a named vendor and have not been reconciled
 * against a live price list. Confirm with the supplier before committing a price
 * to a customer.
 *
 * @version 1.0.0 - Initial handle hardware catalog
 */

import type { DoorHandleType, DrawerHandleType } from '../types/Cabinet';

// ============================================
// TYPES
// ============================================

/** Physical form of a bought handle. Drives which mesh Handle3D builds. */
export type HandleForm = 'BAR' | 'KNOB';

/** Cross-section of a BAR handle's grip. */
export type HandleProfile = 'ROUND' | 'SQUARE';

/**
 * A purchasable handle. All linear dimensions in mm, price in THB.
 */
export interface HandleSpec {
  /** Stable SKU — also the BOM line key. */
  sku: string;
  /** Display name (EN). */
  name: string;
  vendor: string;
  form: HandleForm;
  /** Grip cross-section. Ignored for KNOB. */
  profile: HandleProfile;
  /** Overall grip length (mm). For KNOB this is the head diameter. */
  overallLength: number;
  /** Distance between mounting screw axes (mm). 0 for single-screw KNOB. */
  centres: number;
  /** Grip diameter / square side (mm). */
  gripSize: number;
  /** Mounting post diameter (mm). */
  postDia: number;
  /** Distance from the panel front face to the grip centreline (mm). */
  projection: number;
  /** Number of mounting screws (2 for BAR, 1 for KNOB). */
  screwCount: number;
  /** Screw SKU consumed per handle. */
  screwSku: string;
  /** Unit price, THB, ex-VAT. Indicative — see PRICE PROVENANCE above. */
  priceTHB: number;
  /** Finish colour for the 3D mesh. */
  colorHex: string;
}

/** Screw consumable priced separately so the BOM stays honest. */
export interface HandleScrewSpec {
  sku: string;
  name: string;
  priceTHB: number;
}

// ============================================
// CATALOG
// ============================================

/**
 * Mounting screws. Machine screws through the door into the handle post,
 * so the length tracks the panel thickness they are specified for.
 */
export const HANDLE_SCREWS: Record<string, HandleScrewSpec> = {
  'SCR-M4-25': {
    sku: 'SCR-M4-25',
    name: 'Handle Machine Screw M4×25mm',
    priceTHB: 2.5,
  },
  'SCR-M4-30': {
    sku: 'SCR-M4-30',
    name: 'Handle Machine Screw M4×30mm',
    priceTHB: 3,
  },
};

/**
 * Purchasable handles. Kept deliberately small — five real parts that cover the
 * common kitchen cases — rather than a wide catalog of entries nobody has priced.
 */
export const HANDLE_CATALOG: Record<string, HandleSpec> = {
  'HDL-BAR-160-SS': {
    sku: 'HDL-BAR-160-SS',
    name: 'Bar Pull 160mm, Stainless',
    vendor: 'Generic',
    form: 'BAR',
    profile: 'ROUND',
    overallLength: 192,
    centres: 160,
    gripSize: 12,
    postDia: 10,
    projection: 35,
    screwCount: 2,
    screwSku: 'SCR-M4-25',
    priceTHB: 180,
    colorHex: '#c8ccd0',
  },
  'HDL-BAR-320-SS': {
    sku: 'HDL-BAR-320-SS',
    name: 'Bar Pull 320mm, Stainless',
    vendor: 'Generic',
    form: 'BAR',
    profile: 'ROUND',
    overallLength: 352,
    centres: 320,
    gripSize: 12,
    postDia: 10,
    projection: 35,
    screwCount: 2,
    screwSku: 'SCR-M4-25',
    priceTHB: 320,
    colorHex: '#c8ccd0',
  },
  'HDL-BAR-128-BK': {
    sku: 'HDL-BAR-128-BK',
    name: 'Square Bar Pull 128mm, Matt Black',
    vendor: 'Generic',
    form: 'BAR',
    profile: 'SQUARE',
    overallLength: 148,
    centres: 128,
    gripSize: 12,
    postDia: 10,
    projection: 32,
    screwCount: 2,
    screwSku: 'SCR-M4-25',
    priceTHB: 165,
    colorHex: '#2a2a2c',
  },
  'HDL-KNOB-32-SS': {
    sku: 'HDL-KNOB-32-SS',
    name: 'Round Knob 32mm, Stainless',
    vendor: 'Generic',
    form: 'KNOB',
    profile: 'ROUND',
    overallLength: 32,
    centres: 0,
    gripSize: 32,
    postDia: 8,
    projection: 28,
    screwCount: 1,
    screwSku: 'SCR-M4-30',
    priceTHB: 95,
    colorHex: '#c8ccd0',
  },
  'HDL-KNOB-30-BK': {
    sku: 'HDL-KNOB-30-BK',
    name: 'Round Knob 30mm, Matt Black',
    vendor: 'Generic',
    form: 'KNOB',
    profile: 'ROUND',
    overallLength: 30,
    centres: 0,
    gripSize: 30,
    postDia: 8,
    projection: 26,
    screwCount: 1,
    screwSku: 'SCR-M4-30',
    priceTHB: 85,
    colorHex: '#2a2a2c',
  },
};

/** Default SKU chosen for a 'pull' handle when nothing more specific is set. */
export const DEFAULT_PULL_SKU = 'HDL-BAR-160-SS';

/** Default SKU chosen for a 'knob' handle. */
export const DEFAULT_KNOB_SKU = 'HDL-KNOB-32-SS';

// ============================================
// LOOKUPS
// ============================================

/** Look up a handle by SKU. Returns null rather than throwing on a bad key. */
export function getHandleSpec(sku: string): HandleSpec | null {
  return HANDLE_CATALOG[sku] ?? null;
}

/** Look up a mounting screw by SKU. */
export function getHandleScrewSpec(sku: string): HandleScrewSpec | null {
  return HANDLE_SCREWS[sku] ?? null;
}

/**
 * Map a configured handle type onto a purchasable SKU.
 *
 * Returns null for every case that buys nothing:
 *  - 'none'        — the user turned handles off
 *  - 'push_latch'  — a push-to-open mechanism, not a grip (its own hardware line
 *                    belongs to the hinge/slide lane, not here)
 *  - 'j-pull' / 'j_pull' — a J-pull is a profile ROUTED into the door edge, not a
 *                    bought part. Billing one would be a false cost.
 *
 * The two spellings exist because DrawerHandleType uses 'j-pull' and
 * DoorHandleType uses 'j_pull'. Normalising here keeps that mismatch from
 * silently dropping a handle somewhere downstream.
 */
export function resolveHandleSku(
  handleType: DoorHandleType | DrawerHandleType
): string | null {
  switch (handleType) {
    case 'pull':
      return DEFAULT_PULL_SKU;
    case 'knob':
      return DEFAULT_KNOB_SKU;
    case 'j-pull':
    case 'j_pull':
    case 'push_latch':
    case 'none':
      return null;
    default:
      return null;
  }
}
