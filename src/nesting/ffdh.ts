/**
 * T027: Cut Optimization Algorithm — FFDH (First Fit Decreasing Height)
 *
 * Pure, deterministic shelf-based nesting algorithm.
 * Guillotine-compatible by nature: shelves span full sheet width,
 * horizontal cuts separate shelves, vertical cuts separate parts within shelves.
 *
 * @version 2.0.0 - Phase 2: Grain direction constraints
 * @module
 */

import type { NestingPart, NestingConfig, Placement, Shelf, SheetResult } from './types';

// ============================================
// SORTING
// ============================================

/**
 * Deterministic sort: height desc → width desc → id asc.
 * Ensures identical output for identical input regardless of JS engine.
 */
function sortParts(parts: NestingPart[]): NestingPart[] {
  return [...parts].sort((a, b) => {
    // 1. Height descending (tallest first → better shelf utilization)
    if (b.height !== a.height) return b.height - a.height;
    // 2. Width descending (wider first → fills shelves more efficiently)
    if (b.width !== a.width) return b.width - a.width;
    // 3. ID ascending (absolute stability)
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ============================================
// ORIENTATION HELPERS
// ============================================

interface Orientation {
  /** Effective width when placed in this orientation */
  w: number;
  /** Effective height when placed in this orientation */
  h: number;
  /** Rotation value */
  rotation: 0 | 90;
}

/**
 * Get possible orientations for a part.
 * Always returns original orientation first, then rotated if allowed & different.
 *
 * Grain direction constraint:
 * - `grainDirection='NONE'`: rotation freely allowed (if canRotate=true)
 * - `grainDirection='HORIZONTAL'|'VERTICAL'`: rotation only if canRotate=true
 *   (optimizer sets canRotate based on grain compatibility)
 */
function getOrientations(part: NestingPart): Orientation[] {
  const orientations: Orientation[] = [
    { w: part.width, h: part.height, rotation: 0 },
  ];
  // Add 90° rotation if allowed and dimensions differ
  if (part.canRotate && part.width !== part.height) {
    orientations.push({ w: part.height, h: part.width, rotation: 90 });
  }
  return orientations;
}

// ============================================
// SINGLE SHEET PACKING
// ============================================

/**
 * Pack as many parts as possible onto a single sheet using FFDH.
 *
 * Parts should be pre-sorted (call sortParts() before).
 *
 * @param parts - Parts to place (sorted by height desc)
 * @param config - Sheet dimensions and clearances
 * @returns Placed parts as SheetResult + any remaining unplaced parts
 */
export function packSingleSheet(
  parts: NestingPart[],
  config: NestingConfig,
): { result: SheetResult; remainingParts: NestingPart[] } {
  const { kerfWidth, edgeClearance, sheetWidth, sheetHeight } = config;

  // Usable area inside edge clearance
  const usableW = sheetWidth - 2 * edgeClearance;
  const usableH = sheetHeight - 2 * edgeClearance;

  const shelves: Shelf[] = [];
  const placements: Placement[] = [];
  const remainingParts: NestingPart[] = [];

  for (const part of parts) {
    const orientations = getOrientations(part);
    let placed = false;

    // 1. Try to fit in an existing shelf
    for (const shelf of shelves) {
      for (const orient of orientations) {
        if (shelf.remainingWidth >= orient.w && shelf.height >= orient.h) {
          placements.push({
            partId: part.id,
            x: shelf.currentX,
            y: shelf.y,
            rotation: orient.rotation,
            cutW: part.width,
            cutH: part.height,
            grainDirection: part.grainDirection,
          });
          shelf.currentX += orient.w + kerfWidth;
          shelf.remainingWidth -= orient.w + kerfWidth;
          placed = true;
          break;
        }
      }
      if (placed) break;
    }

    // 2. If not placed, try creating a new shelf
    if (!placed) {
      // Find the best orientation that fits a new shelf (prefer less wasted shelf height)
      let bestOrient: Orientation | null = null;
      for (const orient of orientations) {
        if (orient.w <= usableW && orient.h <= usableH) {
          // Pick the orientation with smaller height (wastes less shelf space)
          if (!bestOrient || orient.h < bestOrient.h) {
            bestOrient = orient;
          }
        }
      }

      if (bestOrient) {
        // Calculate new shelf Y position
        const newShelfY =
          shelves.length === 0
            ? edgeClearance
            : shelves[shelves.length - 1].y +
              shelves[shelves.length - 1].height +
              kerfWidth;

        // Check if new shelf fits vertically
        if (newShelfY + bestOrient.h <= sheetHeight - edgeClearance) {
          const shelf: Shelf = {
            y: newShelfY,
            height: bestOrient.h,
            currentX: edgeClearance + bestOrient.w + kerfWidth,
            remainingWidth: usableW - bestOrient.w - kerfWidth,
          };
          shelves.push(shelf);

          placements.push({
            partId: part.id,
            x: edgeClearance,
            y: newShelfY,
            rotation: bestOrient.rotation,
            cutW: part.width,
            cutH: part.height,
            grainDirection: part.grainDirection,
          });
          placed = true;
        }
      }
    }

    // 3. If still not placed, add to remaining
    if (!placed) {
      remainingParts.push(part);
    }
  }

  // Calculate utilization
  const usableArea = usableW * usableH;
  const usedArea = placements.reduce((sum, p) => {
    const effectiveW = p.rotation === 90 ? p.cutH : p.cutW;
    const effectiveH = p.rotation === 90 ? p.cutW : p.cutH;
    return sum + effectiveW * effectiveH;
  }, 0);
  const utilization = usableArea > 0 ? (usedArea / usableArea) * 100 : 0;

  return {
    result: {
      placements,
      usableArea,
      usedArea,
      utilization: Math.round(utilization * 10) / 10, // 1 decimal
    },
    remainingParts,
  };
}

// ============================================
// MULTI-SHEET PACKING
// ============================================

/**
 * Run FFDH across multiple sheets until all parts are placed (or unplaceable).
 *
 * @param parts - Unsorted parts (function sorts internally for determinism)
 * @param config - Nesting configuration
 * @returns Array of SheetResults (one per sheet used)
 */
export function ffdhMultiSheet(
  parts: NestingPart[],
  config: NestingConfig,
): { sheets: SheetResult[]; unplacedParts: NestingPart[] } {
  if (parts.length === 0) {
    return { sheets: [], unplacedParts: [] };
  }

  const sorted = sortParts(parts);
  const sheets: SheetResult[] = [];
  let remaining = sorted;

  // Safety limit: prevent infinite loop (max 1000 sheets)
  const MAX_SHEETS = 1000;

  while (remaining.length > 0 && sheets.length < MAX_SHEETS) {
    const { result, remainingParts } = packSingleSheet(remaining, config);

    // If nothing was placed, all remaining parts are too large
    if (result.placements.length === 0) {
      return { sheets, unplacedParts: remaining };
    }

    sheets.push(result);
    remaining = remainingParts;
  }

  return { sheets, unplacedParts: remaining };
}
